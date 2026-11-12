<?php

namespace App\Services\Settings;

use App\Enums\ThemePresetEnum;
use App\Services\Css\BrandColorDerivationService;
use App\Services\Css\OklchHueService;

/**
 * Resolves built-in theme presets into CSS variables with brand / AI precedence.
 *
 * Tokens: the shared `base` surfaces from config/theme-presets.php, with the
 * selected preset's brand colours merged over them.
 * Precedence: custom brand hex → selected preset → default teal.
 * AI override: preset `ai_override` or custom hex within ~30° of OKLCH hue 306°.
 *
 * @phpstan-type ThemeCssBag array{
 *     light: array<string, string>,
 *     dark: array<string, string>,
 *     brandPrimary: string|null,
 *     brandPrimaryDark: string|null,
 *     brandPrimaryForeground: string|null,
 *     brandPrimaryDarkForeground: string|null,
 *     brandPassesAa: bool,
 *     themePreset: string,
 *     aiOverrideApplied: bool
 * }
 */
class ThemePresetService
{
    /**
     * Brand-linked keys omitted from preset injection when a custom hex is set
     * so `--brand-primary` (via app.css) keeps winning without rewriting `--primary`.
     *
     * @var list<string>
     */
    private const BRAND_LINKED_KEYS = [
        'primary',
        'primary-foreground',
        'ring',
        'chart-1',
        'sidebar-primary',
        'sidebar-primary-foreground',
        'sidebar-ring',
    ];

    /**
     * Contrast-safe focus rings (#227) used when the brand colour is below 3:1
     * on the page background (#453). Mirrors the `--ring` defaults in app.css.
     */
    private const FALLBACK_RING_LIGHT = 'var(--color-teal-600)';

    private const FALLBACK_RING_DARK = 'var(--color-teal-400)';

    /**
     * Presets for the appearance picker, each with its full base + brand token
     * maps so the page previews them without a client-side copy of the config.
     *
     * @return list<array{
     *     slug: string,
     *     name: string,
     *     aiOverride: bool,
     *     swatchLight: string,
     *     swatchDark: string,
     *     light: array<string, string>,
     *     dark: array<string, string>
     * }>
     */
    public function catalog(): array
    {
        $presets = config('theme-presets.presets', []);
        $catalog = [];

        foreach (ThemePresetEnum::cases() as $case) {
            $definition = $presets[$case->value] ?? null;

            if (! is_array($definition)) {
                continue;
            }

            $light = $this->presetTokens($definition, 'light');
            $dark = $this->presetTokens($definition, 'dark');

            $catalog[] = [
                'slug' => $case->value,
                'name' => is_string($definition['name'] ?? null) ? $definition['name'] : $case->value,
                'aiOverride' => (bool) ($definition['ai_override'] ?? false),
                'swatchLight' => is_string($light['primary'] ?? null) ? $light['primary'] : '#0E7C86',
                'swatchDark' => is_string($dark['primary'] ?? null) ? $dark['primary'] : '#2CB1BC',
                'light' => $light,
                'dark' => $dark,
            ];
        }

        return $catalog;
    }

    /**
     * Resolve the effective CSS variable maps for the document shell.
     *
     * @return ThemeCssBag
     */
    public function resolve(
        ?string $themePresetSlug,
        ?string $projectColor,
        ?string $projectColorDark,
    ): array {
        $preset = ThemePresetEnum::tryFromNullable($themePresetSlug);
        $definition = $this->presetDefinition($preset);

        $light = $this->presetTokens($definition, 'light');
        $dark = $this->presetTokens($definition, 'dark');

        $aiOverrideFromPreset = (bool) ($definition['ai_override'] ?? false);
        $aiOverrideFromHue = $this->customHexNeedsAiOverride($projectColor)
            || $this->customHexNeedsAiOverride($projectColorDark);
        $aiOverrideApplied = $aiOverrideFromPreset || $aiOverrideFromHue;

        if ($aiOverrideApplied) {
            $light = $this->applyAiTokens($light, config('theme-presets.ai_override_light', []));
            $dark = $this->applyAiTokens($dark, config('theme-presets.ai_override_dark', []));
        }

        $hasCustomLight = is_string($projectColor) && $projectColor !== '';
        $hasCustomDark = is_string($projectColorDark) && $projectColorDark !== '';
        $effectiveDark = $hasCustomDark ? $projectColorDark : ($hasCustomLight ? $projectColor : null);

        $brandAaChecks = [];
        $brandPrimaryForeground = null;
        $brandPrimaryDarkForeground = null;

        if ($hasCustomLight) {
            $lightDerivation = BrandColorDerivationService::fromHex(
                $projectColor,
                $light['background'] ?? '#FFFFFF',
            );
            $brandPrimaryForeground = $lightDerivation['primaryForeground'];
            $brandAaChecks[] = $lightDerivation['passesAa'];
            $light = [
                ...$this->stripBrandLinkedKeys($light),
                ...$this->ringTokens($projectColor, $light['background'] ?? '#FFFFFF', self::FALLBACK_RING_LIGHT),
            ];
        }

        if ($effectiveDark !== null && ($hasCustomLight || $hasCustomDark)) {
            $darkDerivation = BrandColorDerivationService::fromHex(
                $effectiveDark,
                $dark['background'] ?? '#0E171E',
            );
            $brandPrimaryDarkForeground = $darkDerivation['primaryForeground'];
            $brandAaChecks[] = $darkDerivation['passesAa'];
            $dark = [
                ...$this->stripBrandLinkedKeys($dark),
                ...$this->ringTokens($effectiveDark, $dark['background'] ?? '#0E171E', self::FALLBACK_RING_DARK),
            ];
        }

        $brandPassesAa = ! in_array(false, $brandAaChecks, true);

        return [
            'light' => $light,
            'dark' => $dark,
            'brandPrimary' => $hasCustomLight ? $projectColor : null,
            'brandPrimaryDark' => ($hasCustomLight || $hasCustomDark) ? $effectiveDark : null,
            'brandPrimaryForeground' => $brandPrimaryForeground,
            'brandPrimaryDarkForeground' => $brandPrimaryDarkForeground,
            'brandPassesAa' => $brandPassesAa,
            'themePreset' => $preset->value,
            'aiOverrideApplied' => $aiOverrideApplied,
        ];
    }

    public function customHexNeedsAiOverride(?string $hex): bool
    {
        $targetHue = (float) config('theme-presets.ai_accent_hue', 306.0);
        $tolerance = (float) config('theme-presets.ai_override_hue_tolerance', 30.0);

        return OklchHueService::isWithinHue($hex, $targetHue, $tolerance);
    }

    /**
     * @return array<string, mixed>
     */
    private function presetDefinition(ThemePresetEnum $preset): array
    {
        $definition = config('theme-presets.presets.'.$preset->value);

        return is_array($definition) ? $definition : [];
    }

    /**
     * Shared base surfaces with the preset's brand colours merged over them.
     *
     * @param  array<mixed>  $definition
     * @return array<string, string>
     */
    private function presetTokens(array $definition, string $mode): array
    {
        $base = config('theme-presets.base.'.$mode, []);

        return [
            ...$this->tokenMap(is_array($base) ? $base : []),
            ...$this->tokenMap(is_array($definition[$mode] ?? null) ? $definition[$mode] : []),
        ];
    }

    /**
     * @param  array<mixed>  $tokens
     * @return array<string, string>
     */
    private function tokenMap(array $tokens): array
    {
        $map = [];

        foreach ($tokens as $key => $value) {
            if (is_string($key) && is_string($value) && $value !== '') {
                $map[$key] = $value;
            }
        }

        return $map;
    }

    /**
     * @param  array<string, string>  $tokens
     * @param  array<mixed>  $aiTokens
     * @return array<string, string>
     */
    private function applyAiTokens(array $tokens, array $aiTokens): array
    {
        foreach ($this->tokenMap($aiTokens) as $key => $value) {
            $tokens[$key] = $value;
        }

        return $tokens;
    }

    /**
     * Focus ring tokens for a custom brand: the brand itself when it keeps 3:1
     * on the page background (WCAG 2.4.7 / 1.4.11), otherwise the teal fallback.
     *
     * Always emitted (never omitted) so a passing light ring cannot leak into
     * `.dark` through the inline `:root` block.
     *
     * @return array{ring: string, sidebar-ring: string}
     */
    private function ringTokens(string $brandHex, string $background, string $fallbackRing): array
    {
        $ring = BrandColorDerivationService::meetsUiContrast($brandHex, $background) ? $brandHex : $fallbackRing;

        return ['ring' => $ring, 'sidebar-ring' => $ring];
    }

    /**
     * @param  array<string, string>  $tokens
     * @return array<string, string>
     */
    private function stripBrandLinkedKeys(array $tokens): array
    {
        foreach (self::BRAND_LINKED_KEYS as $key) {
            unset($tokens[$key]);
        }

        return $tokens;
    }
}

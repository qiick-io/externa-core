<?php

namespace App\Services\Settings;

use App\Enums\ThemePresetEnum;
use App\Support\Css\BrandColorDerivation;
use App\Support\Css\OklchHue;

/**
 * Resolves built-in theme presets into CSS variables with brand / AI precedence.
 *
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
     * @return list<array{
     *     slug: string,
     *     name: string,
     *     aiOverride: bool,
     *     swatchLight: string,
     *     swatchDark: string
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

            $light = is_array($definition['light'] ?? null) ? $definition['light'] : [];
            $dark = is_array($definition['dark'] ?? null) ? $definition['dark'] : [];

            $catalog[] = [
                'slug' => $case->value,
                'name' => is_string($definition['name'] ?? null) ? $definition['name'] : $case->value,
                'aiOverride' => (bool) ($definition['ai_override'] ?? false),
                'swatchLight' => is_string($light['primary'] ?? null) ? $light['primary'] : '#0E7C86',
                'swatchDark' => is_string($dark['primary'] ?? null) ? $dark['primary'] : '#2CB1BC',
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

        $light = $this->tokenMap($definition['light'] ?? []);
        $dark = $this->tokenMap($definition['dark'] ?? []);

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
            $lightDerivation = BrandColorDerivation::fromHex(
                $projectColor,
                $light['background'] ?? '#FFFFFF',
            );
            $brandPrimaryForeground = $lightDerivation['primaryForeground'];
            $brandAaChecks[] = $lightDerivation['passesAa'];
            $light = $this->stripBrandLinkedKeys($light);
        }

        if ($effectiveDark !== null && ($hasCustomLight || $hasCustomDark)) {
            $darkDerivation = BrandColorDerivation::fromHex(
                $effectiveDark,
                $dark['background'] ?? '#0E171E',
            );
            $brandPrimaryDarkForeground = $darkDerivation['primaryForeground'];
            $brandAaChecks[] = $darkDerivation['passesAa'];
            $dark = $this->stripBrandLinkedKeys($dark);
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

        return OklchHue::isWithinHue($hex, $targetHue, $tolerance);
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

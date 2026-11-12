<?php

namespace App\Services\Settings;

use App\Enums\ThemePresetEnum;
use App\Models\File;
use App\Services\Css\ContrastingForegroundService;
use App\Services\FileTransformService;
use Illuminate\Support\Collection;

/**
 * Resolves project appearance settings into public Inertia / Blade payloads.
 */
class ProjectAppearanceService
{
    public function __construct(
        private readonly SettingsRepositoryService $settings,
        private readonly FileTransformService $fileTransform,
        private readonly ThemePresetService $themePresets,
    ) {}

    /**
     * Raw appearance bag (file fields store File ids).
     *
     * @return array<string, mixed>
     */
    public function raw(): array
    {
        return $this->settings->project(
            'appearance',
            config('settings.appearance.defaults', []),
        );
    }

    /**
     * Minimal public payload for login/shell chrome (no manage permission required).
     *
     * @return array{
     *     projectColor: string|null,
     *     projectColorDark: string|null,
     *     primaryForeground: string|null,
     *     primaryForegroundDark: string|null,
     *     logoUrl: string|null,
     *     logoDarkUrl: string|null,
     *     faviconUrl: string|null,
     *     defaultAppearance: string,
     *     themePreset: string,
     *     brandPassesAa: bool,
     *     aiOverrideApplied: bool,
     *     themeCss: array{
     *         light: array<string, string>,
     *         dark: array<string, string>,
     *         brandPrimary: string|null,
     *         brandPrimaryDark: string|null,
     *         brandPrimaryForeground: string|null,
     *         brandPrimaryDarkForeground: string|null
     *     }
     * }
     */
    public function shared(): array
    {
        $raw = $this->raw();
        $urls = $this->resolveFileUrls([
            'logo' => $raw['project_logo'] ?? null,
            'logoDark' => $raw['project_logo_dark'] ?? null,
            'favicon' => $raw['public_favicon'] ?? null,
        ]);

        $default = $raw['default_appearance'] ?? 'system';
        if (! in_array($default, ['system', 'light', 'dark'], true)) {
            $default = 'system';
        }

        $projectColor = is_string($raw['project_color'] ?? null) ? $raw['project_color'] : null;
        // Unset dark brand falls back to light (dual light/dark brand color).
        $projectColorDark = is_string($raw['project_color_dark'] ?? null)
            ? $raw['project_color_dark']
            : $projectColor;

        $themePreset = ThemePresetEnum::tryFromNullable(
            is_string($raw['theme_preset'] ?? null) ? $raw['theme_preset'] : null,
        )->value;

        $resolved = $this->themePresets->resolve(
            $themePreset,
            $projectColor,
            is_string($raw['project_color_dark'] ?? null) ? $raw['project_color_dark'] : null,
        );

        $primaryForeground = $resolved['brandPrimaryForeground']
            ?? ContrastingForegroundService::forHex($projectColor);
        $primaryForegroundDark = $resolved['brandPrimaryDarkForeground']
            ?? ContrastingForegroundService::forHex($projectColorDark);

        return [
            'projectColor' => $projectColor,
            'projectColorDark' => $projectColorDark,
            'primaryForeground' => $primaryForeground,
            'primaryForegroundDark' => $primaryForegroundDark,
            'logoUrl' => $urls['logo'],
            'logoDarkUrl' => $urls['logoDark'],
            'faviconUrl' => $urls['favicon'],
            'defaultAppearance' => $default,
            'themePreset' => $themePreset,
            'brandPassesAa' => $resolved['brandPassesAa'],
            'aiOverrideApplied' => $resolved['aiOverrideApplied'],
            'themeCss' => [
                'light' => $resolved['light'],
                'dark' => $resolved['dark'],
                'brandPrimary' => $resolved['brandPrimary'],
                'brandPrimaryDark' => $resolved['brandPrimaryDark'],
                'brandPrimaryForeground' => $resolved['brandPrimaryForeground'],
                'brandPrimaryDarkForeground' => $resolved['brandPrimaryDarkForeground'],
            ],
        ];
    }

    /**
     * Edit-form payload including file meta for pickers.
     *
     * @return array{
     *     theme_preset: string,
     *     project_color: string|null,
     *     project_color_dark: string|null,
     *     default_appearance: string,
     *     project_logo: array{id: int, name: string, url: string|null}|null,
     *     project_logo_dark: array{id: int, name: string, url: string|null}|null,
     *     public_favicon: array{id: int, name: string, url: string|null}|null,
     *     theme_presets: list<array{
     *         slug: string,
     *         name: string,
     *         aiOverride: bool,
     *         swatchLight: string,
     *         swatchDark: string
     *     }>,
     *     brand_passes_aa: bool
     * }
     */
    public function forEdit(): array
    {
        $raw = $this->raw();
        $files = $this->loadFiles([
            'project_logo' => $raw['project_logo'] ?? null,
            'project_logo_dark' => $raw['project_logo_dark'] ?? null,
            'public_favicon' => $raw['public_favicon'] ?? null,
        ]);

        $default = $raw['default_appearance'] ?? 'system';
        if (! in_array($default, ['system', 'light', 'dark'], true)) {
            $default = 'system';
        }

        $projectColor = is_string($raw['project_color'] ?? null) ? $raw['project_color'] : null;
        $projectColorDark = is_string($raw['project_color_dark'] ?? null) ? $raw['project_color_dark'] : null;
        $themePreset = ThemePresetEnum::tryFromNullable(
            is_string($raw['theme_preset'] ?? null) ? $raw['theme_preset'] : null,
        )->value;

        $resolved = $this->themePresets->resolve($themePreset, $projectColor, $projectColorDark);

        return [
            'theme_preset' => $themePreset,
            'project_color' => $projectColor,
            'project_color_dark' => $projectColorDark,
            'default_appearance' => $default,
            'project_logo' => $this->fileMeta($files->get($this->intOrNull($raw['project_logo'] ?? null))),
            'project_logo_dark' => $this->fileMeta($files->get($this->intOrNull($raw['project_logo_dark'] ?? null))),
            'public_favicon' => $this->fileMeta($files->get($this->intOrNull($raw['public_favicon'] ?? null))),
            'theme_presets' => $this->themePresets->catalog(),
            'theme_ai_override' => [
                'light' => config('theme-presets.ai_override_light', []),
                'dark' => config('theme-presets.ai_override_dark', []),
                'hue' => (float) config('theme-presets.ai_accent_hue', 306.0),
                'tolerance' => (float) config('theme-presets.ai_override_hue_tolerance', 30.0),
            ],
            'brand_passes_aa' => $resolved['brandPassesAa'],
        ];
    }

    public function defaultAppearance(): string
    {
        return $this->shared()['defaultAppearance'];
    }

    /**
     * Light-theme branding for transactional mail (reset / verify / MailMessage).
     *
     * Logo URL is whatever the assets (or FILE_PUBLIC_URL_BASE) disk exposes — must be
     * an absolute URL reachable by email clients (public disk / CDN / S3), not localhost in prod.
     *
     * @return array{
     *     name: string,
     *     logoUrl: string|null,
     *     primaryColor: string,
     *     primaryForeground: string
     * }
     */
    public function forMail(): array
    {
        $shared = $this->shared();
        $themeCss = $shared['themeCss'];
        $primary = is_string($shared['projectColor'] ?? null) && $shared['projectColor'] !== ''
            ? $shared['projectColor']
            : ($themeCss['light']['primary'] ?? '#0E7C86');
        $foreground = ContrastingForegroundService::forHex($primary) ?? ContrastingForegroundService::WHITE;

        return [
            'name' => app(ProjectSettingsService::class)->displayName(),
            'logoUrl' => $this->absolutePublicUrl($shared['logoUrl'] ?? null),
            'primaryColor' => $primary,
            'primaryForeground' => $foreground,
        ];
    }

    /**
     * @param  array<string, mixed>  $idsByKey
     * @return array<string, string|null>
     */
    private function resolveFileUrls(array $idsByKey): array
    {
        $files = $this->loadFiles($idsByKey);
        $urls = [];

        foreach ($idsByKey as $key => $id) {
            $file = $files->get($this->intOrNull($id));
            $urls[$key] = $file ? $this->fileTransform->publicUrl($file) : null;
        }

        return $urls;
    }

    private function absolutePublicUrl(?string $url): ?string
    {
        if ($url === null || $url === '') {
            return null;
        }

        if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
            return $url;
        }

        return url($url);
    }

    /**
     * @param  array<string, mixed>  $idsByKey
     * @return Collection<int, File>
     */
    private function loadFiles(array $idsByKey): Collection
    {
        $ids = collect($idsByKey)
            ->map(fn (mixed $id): ?int => $this->intOrNull($id))
            ->filter()
            ->unique()
            ->values()
            ->all();

        if ($ids === []) {
            return collect();
        }

        return File::query()->whereIn('id', $ids)->get()->keyBy('id');
    }

    /**
     * @return array{id: int, name: string, url: string|null}|null
     */
    private function fileMeta(?File $file): ?array
    {
        if ($file === null) {
            return null;
        }

        return [
            'id' => $file->id,
            'name' => $file->name,
            'url' => $this->fileTransform->publicUrl($file),
        ];
    }

    private function intOrNull(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_int($value)) {
            return $value;
        }

        if (is_numeric($value)) {
            return (int) $value;
        }

        return null;
    }
}

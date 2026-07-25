<?php

namespace App\Services\Settings;

use App\Models\File;
use App\Services\FileTransformService;
use App\Support\Css\ContrastingForeground;
use Illuminate\Support\Collection;

/**
 * Resolves project appearance settings into public Inertia / Blade payloads.
 */
class ProjectAppearance
{
    public function __construct(
        private readonly SettingsRepository $settings,
        private readonly FileTransformService $fileTransform,
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
     *     defaultAppearance: string
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

        return [
            'projectColor' => $projectColor,
            'projectColorDark' => $projectColorDark,
            'primaryForeground' => ContrastingForeground::forHex($projectColor),
            'primaryForegroundDark' => ContrastingForeground::forHex($projectColorDark),
            'logoUrl' => $urls['logo'],
            'logoDarkUrl' => $urls['logoDark'],
            'faviconUrl' => $urls['favicon'],
            'defaultAppearance' => $default,
        ];
    }

    /**
     * Edit-form payload including file meta for pickers.
     *
     * @return array{
     *     project_color: string|null,
     *     project_color_dark: string|null,
     *     default_appearance: string,
     *     project_logo: array{id: int, name: string, url: string|null}|null,
     *     project_logo_dark: array{id: int, name: string, url: string|null}|null,
     *     public_favicon: array{id: int, name: string, url: string|null}|null
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

        return [
            'project_color' => is_string($raw['project_color'] ?? null) ? $raw['project_color'] : null,
            'project_color_dark' => is_string($raw['project_color_dark'] ?? null) ? $raw['project_color_dark'] : null,
            'default_appearance' => $default,
            'project_logo' => $this->fileMeta($files->get($this->intOrNull($raw['project_logo'] ?? null))),
            'project_logo_dark' => $this->fileMeta($files->get($this->intOrNull($raw['project_logo_dark'] ?? null))),
            'public_favicon' => $this->fileMeta($files->get($this->intOrNull($raw['public_favicon'] ?? null))),
        ];
    }

    public function defaultAppearance(): string
    {
        return $this->shared()['defaultAppearance'];
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

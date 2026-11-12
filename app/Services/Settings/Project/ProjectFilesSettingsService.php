<?php

declare(strict_types=1);

namespace App\Services\Settings\Project;

use App\Services\Settings\ProjectSettingsService;
use App\Services\Uploads\ForbiddenUploadExtensionService;
use App\Services\Uploads\UploadAllowlistService;
use App\Services\Uploads\UploadSizeLimiterService;
use App\Traits\NormalizesProjectSettingValuesTrait;

/**
 * Reads the Files & Media project settings: upload size limits, the upload
 * allowlist overrides and the image transformation presets.
 *
 * Every value comes from the shared, memoized {@see ProjectSettingsService::raw()}.
 *
 * This area's keys of the stored bag are normalized here ({@see normalize()}),
 * and {@see ProjectSettingsService::raw()} composes them with the other areas.
 */
class ProjectFilesSettingsService
{
    use NormalizesProjectSettingValuesTrait;

    public function __construct(
        private readonly ProjectSettingsService $projectSettings,
    ) {}

    /**
     * @return list<string>
     */
    public function allowedTransformations(): array
    {
        return $this->projectSettings->raw()['allowed_transformations'];
    }

    public function isTransformationsEnabled(): bool
    {
        return in_array('thumbnail', $this->allowedTransformations(), true);
    }

    /**
     * @return list<array{
     *     key: string,
     *     fit: string,
     *     width: int|null,
     *     height: int|null,
     *     quality: int,
     *     without_enlargement: bool,
     *     format: string
     * }>
     */
    public function presetTransformations(): array
    {
        return $this->projectSettings->raw()['preset_transformations'];
    }

    /**
     * @return array{
     *     key: string,
     *     fit: string,
     *     width: int|null,
     *     height: int|null,
     *     quality: int,
     *     without_enlargement: bool,
     *     format: string
     * }|null
     */
    public function transformPreset(string $key): ?array
    {
        foreach ($this->presetTransformations() as $preset) {
            if ($preset['key'] === $key) {
                return $preset;
            }
        }

        return null;
    }

    public function maxTransformSize(): int
    {
        $presets = $this->presetTransformations();
        $edges = [];

        foreach ($presets as $preset) {
            if (is_int($preset['width'])) {
                $edges[] = $preset['width'];
            }
            if (is_int($preset['height'])) {
                $edges[] = $preset['height'];
            }
        }

        return $edges === [] ? 256 : max($edges);
    }

    /**
     * Max Files pool upload size in bytes (null = unlimited).
     */
    public function filesMaxUploadBytes(): ?int
    {
        return $this->projectSettings->raw()['files_max_upload_bytes'];
    }

    /**
     * Max chat attachment upload size in bytes (null = unlimited).
     */
    public function chatMaxUploadBytes(): ?int
    {
        return $this->projectSettings->raw()['chat_max_upload_bytes'];
    }

    public function uploadAllowSvg(): bool
    {
        return (bool) $this->projectSettings->raw()['upload_allow_svg'];
    }

    /**
     * null = use config/files.php defaults.
     *
     * @return list<string>|null
     */
    public function uploadAllowedMimes(): ?array
    {
        /** @var list<string>|null $mimes */
        $mimes = $this->projectSettings->raw()['upload_allowed_mimes'];

        return $mimes;
    }

    /**
     * null = no extra extension filter.
     *
     * @return list<string>|null
     */
    public function uploadAllowedExtensions(): ?array
    {
        /** @var list<string>|null $extensions */
        $extensions = $this->projectSettings->raw()['upload_allowed_extensions'];

        return $extensions;
    }

    /**
     * Normalize the Files & Media keys (transformations, upload limits, upload
     * allowlist overrides) of a stored `project` bag.
     *
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>
     */
    public function normalize(array $raw): array
    {
        return [
            'allowed_transformations' => $this->normalizeTransformations($raw['allowed_transformations'] ?? null),
            'preset_transformations' => $this->normalizePresets($raw['preset_transformations'] ?? null),
            'files_max_upload_bytes' => $this->nullablePositiveInt(
                $raw['files_max_upload_bytes'] ?? null,
                1,
                UploadSizeLimiterService::SETTING_MAX_BYTES,
            ),
            'chat_max_upload_bytes' => $this->nullablePositiveInt(
                $raw['chat_max_upload_bytes'] ?? null,
                1,
                UploadSizeLimiterService::SETTING_MAX_BYTES,
            ),
            'upload_allowed_mimes' => $this->normalizeUploadMimeList($raw['upload_allowed_mimes'] ?? null),
            'upload_allowed_extensions' => $this->normalizeUploadExtensionList(
                $raw['upload_allowed_extensions'] ?? null,
            ),
            'upload_allow_svg' => (bool) ($raw['upload_allow_svg'] ?? false),
        ];
    }

    /**
     * @return list<string>
     */
    private function normalizeTransformations(mixed $value): array
    {
        $allowed = config('settings.project.allowed_transformations', ['thumbnail']);

        if (! is_array($value)) {
            return $allowed;
        }

        return collect($value)
            ->map(fn (mixed $item): string => (string) $item)
            ->filter(fn (string $item): bool => in_array($item, $allowed, true))
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @return list<array{
     *     key: string,
     *     fit: string,
     *     width: int|null,
     *     height: int|null,
     *     quality: int,
     *     without_enlargement: bool,
     *     format: string
     * }>
     */
    private function normalizePresets(mixed $value): array
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $value = is_array($decoded)
                ? $decoded
                : (preg_split('/[\s,]+/', $value) ?: []);
        }

        if (! is_array($value) || $value === []) {
            /** @var list<array<string, mixed>> $defaults */
            $defaults = config('settings.project.defaults.preset_transformations', []);
            $value = $defaults;
        }

        $fits = config('settings.project.transform_fits', ['contain']);
        $formats = config('settings.project.transform_formats', ['auto']);
        $normalized = [];
        $seenKeys = [];

        foreach ($value as $entry) {
            // Legacy bare sizes → square contain presets
            if (is_numeric($entry)) {
                $size = (int) $entry;
                if ($size < 16 || $size > 4096) {
                    continue;
                }
                $entry = [
                    'key' => 'size-'.$size,
                    'fit' => 'contain',
                    'width' => $size,
                    'height' => $size,
                    'quality' => 82,
                    'without_enlargement' => true,
                    'format' => 'auto',
                ];
            }

            if (! is_array($entry)) {
                continue;
            }

            $key = is_string($entry['key'] ?? null)
                ? strtolower(trim($entry['key']))
                : '';
            if ($key === '' || ! preg_match('/^[a-z0-9_-]+$/', $key) || isset($seenKeys[$key])) {
                continue;
            }

            $fit = is_string($entry['fit'] ?? null) ? $entry['fit'] : 'contain';
            if (! in_array($fit, $fits, true)) {
                $fit = 'contain';
            }

            $format = is_string($entry['format'] ?? null) ? $entry['format'] : 'auto';
            if (! in_array($format, $formats, true)) {
                $format = 'auto';
            }

            $width = isset($entry['width']) && $entry['width'] !== '' && $entry['width'] !== null
                ? (int) $entry['width']
                : null;
            $height = isset($entry['height']) && $entry['height'] !== '' && $entry['height'] !== null
                ? (int) $entry['height']
                : null;

            if ($width !== null && ($width < 1 || $width > 4096)) {
                $width = null;
            }
            if ($height !== null && ($height < 1 || $height > 4096)) {
                $height = null;
            }
            if ($width === null && $height === null) {
                continue;
            }

            $quality = is_numeric($entry['quality'] ?? null) ? (int) $entry['quality'] : 82;
            $quality = max(1, min(100, $quality));

            $seenKeys[$key] = true;
            $normalized[] = [
                'key' => $key,
                'fit' => $fit,
                'width' => $width,
                'height' => $height,
                'quality' => $quality,
                'without_enlargement' => (bool) ($entry['without_enlargement'] ?? true),
                'format' => $format,
            ];
        }

        if ($normalized !== []) {
            return $normalized;
        }

        // Hard fallback if config defaults are empty/invalid
        return [[
            'key' => 'thumbnail',
            'fit' => 'contain',
            'width' => 128,
            'height' => 128,
            'quality' => 82,
            'without_enlargement' => true,
            'format' => 'auto',
        ]];
    }

    /**
     * @return list<string>|null
     */
    private function normalizeUploadMimeList(mixed $value): ?array
    {
        if ($value === null || $value === '' || $value === []) {
            return null;
        }

        if (! is_array($value)) {
            return null;
        }

        $mimes = array_values(array_unique(array_filter(array_map(
            static fn (mixed $mime): string => strtolower(trim((string) $mime)),
            $value,
        ), static fn (string $mime): bool => $mime !== '' && str_contains($mime, '/'))));

        return $mimes === [] ? null : $mimes;
    }

    /**
     * @return list<string>|null
     */
    private function normalizeUploadExtensionList(mixed $value): ?array
    {
        if ($value === null || $value === '' || $value === []) {
            return null;
        }

        if (! is_array($value)) {
            return null;
        }

        $extensions = array_values(array_unique(array_filter(array_map(
            static function (mixed $ext): string {
                $normalized = strtolower(trim((string) $ext));
                $normalized = ltrim($normalized, '.');

                return preg_replace('/[^a-z0-9]/', '', $normalized) ?? '';
            },
            $value,
        ), static fn (string $ext): bool => $ext !== '')));

        // Hard floor extensions can never be allowlisted via settings.
        $extensions = array_values(array_filter(
            $extensions,
            static fn (string $ext): bool => ! ForbiddenUploadExtensionService::isHardFloor("file.{$ext}")
                || in_array($ext, UploadAllowlistService::SVG_EXTENSIONS, true),
        ));

        return $extensions === [] ? null : $extensions;
    }
}

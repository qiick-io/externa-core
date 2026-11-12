<?php

declare(strict_types=1);

namespace App\Services\Settings\Project;

use App\Services\Settings\ProjectSettingsService;

/**
 * Reads the Files & Media project settings: upload size limits, the upload
 * allowlist overrides and the image transformation presets.
 *
 * Every value comes from the shared, memoized {@see ProjectSettingsService::raw()}.
 */
class ProjectFilesSettingsService
{
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
}

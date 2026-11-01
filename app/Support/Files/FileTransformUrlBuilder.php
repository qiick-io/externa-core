<?php

namespace App\Support\Files;

use App\Services\Settings\ProjectSettingsService;
use Throwable;

/**
 * Shared public-API transform URL map for image files.
 */
final class FileTransformUrlBuilder
{
    /**
     * @return array<string, string>
     */
    public static function urlsFor(int $fileId, ?string $mimeType): array
    {
        if (! is_string($mimeType) || ! str_starts_with($mimeType, 'image/')) {
            return [];
        }

        try {
            $transforms = [];
            foreach (app(ProjectSettingsService::class)->presetTransformations() as $preset) {
                $key = $preset['key'] ?? null;
                if (! is_string($key) || $key === '') {
                    continue;
                }
                $transforms[$key] = url("/api/v1/files/{$fileId}/transforms/{$key}");
            }

            return $transforms;
        } catch (Throwable $exception) {
            report($exception);

            return [];
        }
    }
}

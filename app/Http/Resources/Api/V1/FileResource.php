<?php

namespace App\Http\Resources\Api\V1;

use App\Models\File;
use App\Services\Settings\ProjectSettings;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Lean public CMS API file payload (no admin-only fields).
 *
 * @mixin File
 */
class FileResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var File $file */
        $file = $this->resource;

        $transforms = [];
        if ($file->isFile() && is_string($file->mime_type) && str_starts_with($file->mime_type, 'image/')) {
            try {
                foreach (app(ProjectSettings::class)->presetTransformations() as $preset) {
                    $key = $preset['key'] ?? null;
                    if (! is_string($key) || $key === '') {
                        continue;
                    }
                    $transforms[$key] = url("/api/v1/files/{$file->id}/transforms/{$key}");
                }
            } catch (\Throwable) {
                // Settings unavailable — omit transforms
            }
        }

        return [
            'id' => $file->id,
            'parent_id' => $file->parent_id,
            'type' => $file->type->value,
            'access' => $file->effectiveAccess()->value,
            'filename' => $file->name,
            'title' => $file->title,
            'description' => $file->description,
            'mime_type' => $file->mime_type,
            'extension' => $file->extension,
            'filesize' => $file->size,
            'width' => $file->width,
            'height' => $file->height,
            'focal_point_x' => $file->focal_point_x,
            'focal_point_y' => $file->focal_point_y,
            'url' => $file->isFile()
                ? url("/api/v1/files/{$file->id}/content")
                : null,
            'transforms' => $transforms === [] ? (object) [] : $transforms,
            'created_at' => $file->created_at?->toIso8601String(),
            'updated_at' => $file->updated_at?->toIso8601String(),
        ];
    }
}

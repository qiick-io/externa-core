<?php

namespace App\Http\Resources\Api\V1;

use App\Models\File;
use App\Support\Files\FileTransformUrlBuilder;
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

        $transforms = $file->isFile()
            ? FileTransformUrlBuilder::urlsFor((int) $file->id, $file->mime_type)
            : [];

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

<?php

namespace App\Http\Resources\Admin;

use App\Models\File;
use App\Services\FileTransformService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
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
        $transformService = app(FileTransformService::class);
        $publicUrl = $transformService->publicUrl($this->resource);
        $thumbnailUrl = $transformService->isImage($this->resource)
            ? route('files.thumbnail', $this->resource)
            : null;

        return [
            'id' => $this->id,
            'uuid' => $this->uuid,
            'parent_id' => $this->parent_id,
            'type' => $this->type->value,
            'name' => $this->name,
            'title' => $this->title,
            'description' => $this->description,
            'location' => $this->location,
            'download_name' => $this->download_name,
            'path' => $this->path,
            'disk' => $this->disk,
            'storage_path' => $this->storage_path,
            'url' => $publicUrl,
            'thumbnail_url' => $thumbnailUrl,
            'mime_type' => $this->mime_type,
            'extension' => $this->extension,
            'size' => $this->size,
            'width' => $this->width,
            'height' => $this->height,
            'meta' => $this->meta,
            'hash' => $this->hash,
            'focal_point_x' => $this->focal_point_x,
            'focal_point_y' => $this->focal_point_y,
            'translate_x' => $this->translate_x,
            'translate_y' => $this->translate_y,
            'scale' => $this->scale,
            'is_favorited' => (bool) ($this->is_favorited ?? false),
            'tags' => $this->whenLoaded('tags', fn () => $this->tags->map(fn ($tag) => [
                'id' => $tag->id,
                'name' => $tag->name,
                'slug' => $tag->slug,
            ])->values()->all(), []),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'deleted_at' => $this->deleted_at?->toIso8601String(),
        ];
    }
}

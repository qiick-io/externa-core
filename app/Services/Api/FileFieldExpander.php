<?php

namespace App\Services\Api;

use App\Enums\FieldTypeEnum;
use App\Enums\FilePermissionAction;
use App\Models\Collection;
use App\Models\File;
use App\Services\Settings\ProjectSettings;
use App\Support\Api\ApiAccess;

/**
 * Expand image/file/files field values to public file payloads on API responses.
 */
class FileFieldExpander
{
    public function __construct(
        private FilePermissionGuard $filePermissionGuard,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function expand(array $data, Collection $collection, ?ApiAccess $access): array
    {
        $collection->loadMissing('fields');

        $canReadFiles = $access !== null
            && $this->filePermissionGuard->allows($access->roleId(), FilePermissionAction::Read);

        $fileFieldKeys = [];
        foreach ($collection->fields as $field) {
            $type = $field->type instanceof FieldTypeEnum
                ? $field->type
                : FieldTypeEnum::tryFrom((string) $field->type);

            if (in_array($type, [FieldTypeEnum::Image, FieldTypeEnum::File, FieldTypeEnum::Files], true)) {
                $fileFieldKeys[$field->name] = $type;
            }
        }

        if ($fileFieldKeys === []) {
            return $data;
        }

        $ids = $this->collectFileIds($data, $fileFieldKeys);
        $filesById = $ids === []
            ? collect()
            : File::query()->whereIn('id', $ids)->get()->keyBy('id');

        foreach ($fileFieldKeys as $key => $type) {
            if (! array_key_exists($key, $data)) {
                continue;
            }

            if ($type === FieldTypeEnum::Files) {
                $raw = $data[$key];
                if (! is_array($raw)) {
                    $data[$key] = null;

                    continue;
                }

                $expanded = [];
                foreach ($raw as $entry) {
                    $id = $this->normalizeId($entry);
                    if ($id === null) {
                        continue;
                    }
                    $payload = $this->expandOne($id, $filesById->get($id), $canReadFiles);
                    if ($payload !== null) {
                        $expanded[] = $payload;
                    }
                }
                $data[$key] = $expanded;

                continue;
            }

            $id = $this->normalizeId($data[$key]);
            if ($id === null) {
                $data[$key] = null;

                continue;
            }

            $data[$key] = $this->expandOne($id, $filesById->get($id), $canReadFiles);
        }

        return $data;
    }

    /**
     * @param  array<string, FieldTypeEnum>  $fileFieldKeys
     * @param  array<string, mixed>  $data
     * @return list<int>
     */
    private function collectFileIds(array $data, array $fileFieldKeys): array
    {
        $ids = [];
        foreach ($fileFieldKeys as $key => $type) {
            if (! array_key_exists($key, $data)) {
                continue;
            }
            if ($type === FieldTypeEnum::Files && is_array($data[$key])) {
                foreach ($data[$key] as $entry) {
                    $id = $this->normalizeId($entry);
                    if ($id !== null) {
                        $ids[] = $id;
                    }
                }
            } else {
                $id = $this->normalizeId($data[$key]);
                if ($id !== null) {
                    $ids[] = $id;
                }
            }
        }

        return array_values(array_unique($ids));
    }

    private function normalizeId(mixed $value): ?int
    {
        if (is_int($value)) {
            return $value > 0 ? $value : null;
        }
        if (is_string($value) && ctype_digit($value)) {
            $id = (int) $value;

            return $id > 0 ? $id : null;
        }
        if (is_array($value) && isset($value['id']) && is_numeric($value['id'])) {
            $id = (int) $value['id'];

            return $id > 0 ? $id : null;
        }

        return null;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function expandOne(int $id, mixed $file, bool $canReadFiles): ?array
    {
        if (! $file instanceof File || $file->trashed() || ! $file->isFile()) {
            return null;
        }

        if (! $canReadFiles) {
            return ['id' => $id];
        }

        $transforms = [];
        if (is_string($file->mime_type) && str_starts_with($file->mime_type, 'image/')) {
            try {
                foreach (app(ProjectSettings::class)->presetTransformations() as $preset) {
                    $key = $preset['key'] ?? null;
                    if (! is_string($key) || $key === '') {
                        continue;
                    }
                    $transforms[$key] = url("/api/v1/files/{$file->id}/transforms/{$key}");
                }
            } catch (\Throwable) {
                // omit transforms when settings unavailable
            }
        }

        return [
            'id' => $file->id,
            'filename' => $file->name,
            'title' => $file->title,
            'mime_type' => $file->mime_type,
            'width' => $file->width,
            'height' => $file->height,
            'filesize' => $file->size,
            'url' => url("/api/v1/files/{$file->id}/content"),
            'transforms' => $transforms === [] ? (object) [] : $transforms,
        ];
    }
}

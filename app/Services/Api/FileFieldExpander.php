<?php

namespace App\Services\Api;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\File;
use App\Services\Settings\ProjectSettings;
use App\Support\Api\ApiAccess;
use App\Support\Collections\BlocksFieldSchema;

/**
 * Expand image/file/files field values to public file payloads on API responses.
 *
 * Private files without read_private are redacted (null / omitted) — no id leak.
 * Public files without read return { id, access: "denied" }.
 */
class FileFieldExpander
{
    public function __construct(
        private FilePermissionGuard $filePermissionGuard,
        private BlocksFieldSchema $blocksFieldSchema,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function expand(array $data, Collection $collection, ?ApiAccess $access): array
    {
        $collection->loadMissing('fields');

        $roleId = $access?->roleId();

        $fileFieldKeys = [];
        foreach ($collection->fields as $field) {
            $type = $field->type instanceof FieldTypeEnum
                ? $field->type
                : FieldTypeEnum::tryFrom((string) $field->type);

            if (in_array($type, [FieldTypeEnum::Image, FieldTypeEnum::File, FieldTypeEnum::Files, FieldTypeEnum::Blocks], true)) {
                $fileFieldKeys[$field->name] = $field;
            }
        }

        if ($fileFieldKeys === []) {
            return $data;
        }

        $ids = $this->collectFileIds($data, $fileFieldKeys);
        $filesById = $ids === []
            ? collect()
            : File::query()->whereIn('id', $ids)->get()->keyBy('id');

        foreach ($fileFieldKeys as $key => $field) {
            $type = $field->type;
            if (! array_key_exists($key, $data)) {
                continue;
            }

            if ($type === FieldTypeEnum::Blocks) {
                $data[$key] = $this->expandBlocks($data[$key], $field, $filesById, $roleId);

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
                    $payload = $this->expandOne($id, $filesById->get($id), $roleId);
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

            $data[$key] = $this->expandOne($id, $filesById->get($id), $roleId);
        }

        return $data;
    }

    /**
     * @param  array<string, CollectionField>  $fileFieldKeys
     * @param  array<string, mixed>  $data
     * @return list<int>
     */
    private function collectFileIds(array $data, array $fileFieldKeys): array
    {
        $ids = [];
        foreach ($fileFieldKeys as $key => $field) {
            $type = $field->type;
            if (! array_key_exists($key, $data)) {
                continue;
            }
            if ($type === FieldTypeEnum::Blocks) {
                foreach ($this->collectBlockFileIds($data[$key], $field) as $id) {
                    $ids[] = $id;
                }

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

    /**
     * @param  \Illuminate\Support\Collection<int, File>  $filesById
     */
    private function expandBlocks(mixed $rawBlocks, CollectionField $blocksField, $filesById, ?int $roleId): mixed
    {
        if (! is_array($rawBlocks)) {
            return [];
        }

        $types = $this->blocksFieldSchema->blockTypeMap($blocksField);

        return array_map(function ($block) use ($types, $filesById, $roleId) {
            if (! is_array($block)) {
                return $block;
            }

            $type = (string) ($block['type'] ?? '');
            $schema = $types[$type] ?? null;
            $data = is_array($block['data'] ?? null) ? $block['data'] : [];
            if (! is_array($schema)) {
                $block['data'] = $data;

                return $block;
            }

            foreach ($schema['fields'] as $definition) {
                $nestedType = FieldTypeEnum::tryFrom((string) ($definition['type'] ?? ''));
                $name = (string) ($definition['name'] ?? '');
                if ($nestedType === null || $name === '' || ! array_key_exists($name, $data)) {
                    continue;
                }

                $nestedValue = $data[$name];

                if ($nestedType === FieldTypeEnum::Blocks) {
                    $nestedField = $this->blocksFieldSchema->toFieldDefinition($definition);
                    $data[$name] = $this->expandBlocks($nestedValue, $nestedField, $filesById, $roleId);

                    continue;
                }

                if ($nestedType === FieldTypeEnum::M2a) {
                    // Nested m2a stays JSON-embedded links (no junction); normalize shape on read.
                    $data[$name] = $this->expandNestedM2aValue($nestedValue);

                    continue;
                }

                if (in_array($nestedType, [
                    FieldTypeEnum::ManyToMany,
                    FieldTypeEnum::OneToMany,
                    FieldTypeEnum::RelationMany,
                ], true)) {
                    // Nested m2m/o2m are JSON-embedded link lists — not SQL junctions.
                    $data[$name] = $this->expandNestedM2mValue($nestedValue);

                    continue;
                }

                if (($definition['translatable'] ?? false) === true && is_array($nestedValue)) {
                    foreach ($nestedValue as $locale => $localeValue) {
                        $data[$name][$locale] = $this->expandNestedFileValue($nestedType, $localeValue, $filesById, $roleId);
                    }

                    continue;
                }

                $data[$name] = $this->expandNestedFileValue($nestedType, $nestedValue, $filesById, $roleId);
            }

            $block['data'] = $data;

            return $block;
        }, $rawBlocks);
    }

    /**
     * @return list<array{related_collection_id: int, related_item_id: int}>
     */
    private function expandNestedM2aValue(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $out = [];
        foreach ($value as $entry) {
            if (! is_array($entry)) {
                continue;
            }

            $collectionId = $entry['related_collection_id'] ?? null;
            $itemId = $entry['related_item_id'] ?? null;
            if (! is_numeric($collectionId) || ! is_numeric($itemId)) {
                continue;
            }

            $out[] = [
                'related_collection_id' => (int) $collectionId,
                'related_item_id' => (int) $itemId,
            ];
        }

        return $out;
    }

    /**
     * Nested m2m/o2m: JSON link list `{ related_item_id, meta }` (ints accepted).
     *
     * @return list<array{related_item_id: int, meta: array<string, mixed>}>
     */
    private function expandNestedM2mValue(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $out = [];
        foreach ($value as $entry) {
            if (is_numeric($entry)) {
                $out[] = [
                    'related_item_id' => (int) $entry,
                    'meta' => [],
                ];

                continue;
            }

            if (! is_array($entry)) {
                continue;
            }

            $id = $entry['related_item_id'] ?? $entry['id'] ?? null;
            if (! is_numeric($id)) {
                continue;
            }

            $meta = $entry['meta'] ?? [];
            $out[] = [
                'related_item_id' => (int) $id,
                'meta' => is_array($meta) ? $meta : [],
            ];
        }

        return $out;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, File>  $filesById
     */
    private function expandNestedFileValue(FieldTypeEnum $type, mixed $value, $filesById, ?int $roleId): mixed
    {
        if ($type === FieldTypeEnum::Files && is_array($value)) {
            $expanded = [];
            foreach ($value as $entry) {
                $id = $this->normalizeId($entry);
                if ($id === null) {
                    continue;
                }
                $payload = $this->expandOne($id, $filesById->get($id), $roleId);
                if ($payload !== null) {
                    $expanded[] = $payload;
                }
            }

            return $expanded;
        }

        if (! in_array($type, [FieldTypeEnum::Image, FieldTypeEnum::File], true)) {
            return $value;
        }

        $id = $this->normalizeId($value);

        return $id === null ? null : $this->expandOne($id, $filesById->get($id), $roleId);
    }

    /**
     * @return list<int>
     */
    private function collectBlockFileIds(mixed $rawBlocks, CollectionField $blocksField): array
    {
        if (! is_array($rawBlocks)) {
            return [];
        }

        $types = $this->blocksFieldSchema->blockTypeMap($blocksField);
        $ids = [];

        foreach ($rawBlocks as $block) {
            if (! is_array($block)) {
                continue;
            }

            $type = (string) ($block['type'] ?? '');
            $schema = $types[$type] ?? null;
            $data = is_array($block['data'] ?? null) ? $block['data'] : [];
            if (! is_array($schema)) {
                continue;
            }

            foreach ($schema['fields'] as $definition) {
                $nestedType = FieldTypeEnum::tryFrom((string) ($definition['type'] ?? ''));
                $name = (string) ($definition['name'] ?? '');
                if ($nestedType === null || $name === '' || ! array_key_exists($name, $data)) {
                    continue;
                }

                $nestedValue = $data[$name];

                if ($nestedType === FieldTypeEnum::Blocks) {
                    $nestedField = $this->blocksFieldSchema->toFieldDefinition($definition);
                    foreach ($this->collectBlockFileIds($nestedValue, $nestedField) as $id) {
                        $ids[] = $id;
                    }

                    continue;
                }

                $values = ($definition['translatable'] ?? false) === true && is_array($nestedValue)
                    ? array_values($nestedValue)
                    : [$nestedValue];

                foreach ($values as $value) {
                    if ($nestedType === FieldTypeEnum::Files && is_array($value)) {
                        foreach ($value as $entry) {
                            $id = $this->normalizeId($entry);
                            if ($id !== null) {
                                $ids[] = $id;
                            }
                        }

                        continue;
                    }

                    if (! in_array($nestedType, [FieldTypeEnum::Image, FieldTypeEnum::File], true)) {
                        continue;
                    }

                    $id = $this->normalizeId($value);
                    if ($id !== null) {
                        $ids[] = $id;
                    }
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
    private function expandOne(int $id, mixed $file, ?int $roleId): ?array
    {
        if (! $file instanceof File || $file->trashed() || ! $file->isFile()) {
            return null;
        }

        $isPrivate = $file->isEffectivelyPrivate();

        // Private without grant: omit entirely (no id leak), even if collection is readable.
        if ($isPrivate) {
            if ($roleId === null || ! $this->filePermissionGuard->canReadFile($roleId, $file)) {
                return null;
            }
        } elseif ($roleId === null || ! $this->filePermissionGuard->canReadFile($roleId, $file)) {
            // Public file, no read grant: id + explicit denial signal (clients can prompt for Files → Read).
            return [
                'id' => $id,
                'access' => 'denied',
            ];
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

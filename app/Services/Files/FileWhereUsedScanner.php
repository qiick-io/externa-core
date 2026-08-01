<?php

namespace App\Services\Files;

use App\Enums\FieldTypeEnum;
use App\Models\CollectionField;
use App\Models\CollectionItemValue;
use App\Support\Collections\BlocksFieldSchema;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * On-demand scan of collection item values that reference a given file id.
 *
 * ponytail: no dedicated index in v1 — LIKE prefilter + exact id match; 30s cache.
 * Upgrade: GIN/inverted index on file refs if scan cost grows.
 */
class FileWhereUsedScanner
{
    private const CACHE_SECONDS = 30;

    public function __construct(
        private BlocksFieldSchema $blocksFieldSchema,
    ) {}

    /**
     * @return list<array{
     *     collection_id: int,
     *     collection_name: string,
     *     collection_slug: string,
     *     item_id: int,
     *     field: string
     * }>
     */
    public function findReferences(int $fileId): array
    {
        if ($fileId < 1) {
            return [];
        }

        return Cache::remember(
            "file-where-used:{$fileId}",
            self::CACHE_SECONDS,
            fn (): array => $this->scan($fileId),
        );
    }

    public function countReferences(int $fileId): int
    {
        return count($this->findReferences($fileId));
    }

    public function forget(int $fileId): void
    {
        Cache::forget("file-where-used:{$fileId}");
    }

    /**
     * @return list<array{
     *     collection_id: int,
     *     collection_name: string,
     *     collection_slug: string,
     *     item_id: int,
     *     field: string
     * }>
     */
    private function scan(int $fileId): array
    {
        $fieldIds = CollectionField::query()
            ->whereIn('type', [
                FieldTypeEnum::Image->value,
                FieldTypeEnum::File->value,
                FieldTypeEnum::Files->value,
                FieldTypeEnum::Blocks->value,
            ])
            ->pluck('id');

        if ($fieldIds->isEmpty()) {
            return [];
        }

        $needle = (string) $fileId;
        $driver = DB::connection()->getDriverName();

        $candidates = CollectionItemValue::query()
            ->whereIn('field_id', $fieldIds)
            ->whereHas('item', static fn ($q) => $q->whereNull('deleted_at'))
            ->where(function ($q) use ($needle, $driver): void {
                if ($driver === 'pgsql') {
                    $q->whereRaw('value::text LIKE ?', ['%'.$needle.'%']);
                } elseif ($driver === 'sqlite') {
                    $q->whereRaw('CAST(value AS TEXT) LIKE ?', ['%'.$needle.'%']);
                } else {
                    $q->whereRaw('CAST(value AS CHAR) LIKE ?', ['%'.$needle.'%']);
                }
            })
            ->with(['item.collection:id,name,slug', 'field:id,name,type,settings'])
            ->get();

        $refs = [];
        $seen = [];

        foreach ($candidates as $row) {
            $field = $row->field;
            $item = $row->item;
            if ($field === null || $item === null || $item->collection === null) {
                continue;
            }

            if (! $this->valueReferencesFile($row->value, $field, $fileId)) {
                continue;
            }

            $key = $item->collection_id.'|'.$item->id.'|'.$field->name;
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;

            $refs[] = [
                'collection_id' => (int) $item->collection_id,
                'collection_name' => (string) $item->collection->name,
                'collection_slug' => (string) $item->collection->slug,
                'item_id' => (int) $item->id,
                'field' => (string) $field->name,
            ];
        }

        usort(
            $refs,
            static fn (array $a, array $b): int => [$a['collection_name'], $a['item_id'], $a['field']]
                <=> [$b['collection_name'], $b['item_id'], $b['field']],
        );

        return $refs;
    }

    private function valueReferencesFile(mixed $value, CollectionField $field, int $fileId): bool
    {
        $type = $field->type instanceof FieldTypeEnum
            ? $field->type
            : FieldTypeEnum::tryFrom((string) $field->type);

        if ($type === null) {
            return false;
        }

        if ($type === FieldTypeEnum::Blocks) {
            return in_array($fileId, $this->collectBlockFileIds($value, $field), true);
        }

        // Array-storage fields (files / multi-image) store one id per value row.
        if ($type === FieldTypeEnum::Files || ($type === FieldTypeEnum::Image && $field->usesArrayStorage())) {
            if (is_array($value)) {
                foreach ($value as $entry) {
                    if ($this->normalizeId($entry) === $fileId) {
                        return true;
                    }
                }

                return false;
            }

            return $this->normalizeId($value) === $fileId;
        }

        if (in_array($type, [FieldTypeEnum::Image, FieldTypeEnum::File], true)) {
            return $this->normalizeId($value) === $fileId;
        }

        return false;
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
}

<?php

namespace App\Services\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;

/**
 * Validate and default collection list column paths (user presentation prefs).
 *
 * Paths: system keys, field names, or nested `parent.child` (1 level) on relation/file.
 */
class CollectionListColumnsNormalizer
{
    public const SYSTEM_COLUMNS = ['id', 'created_at', 'updated_at', 'user_created', 'user_updated'];

    /** @var list<string> */
    public const FILE_META_KEYS = ['id', 'filename_download', 'type', 'filesize'];

    /** @var list<string> */
    private const LIST_FRIENDLY_TYPES = [
        'string',
        'number',
        'boolean',
        'select',
        'radio',
        'radio_group',
        'date',
        'color',
        'autocomplete',
        'hash',
    ];

    /** @var list<string> */
    private const PREFERRED_NAMES = ['title', 'name', 'slug', 'label', 'status'];

    private const DEFAULT_FIELD_LIMIT = 5;

    /**
     * @param  list<mixed>|mixed  $columns
     * @return list<string>
     */
    public function normalize(mixed $columns, Collection $collection): array
    {
        if (! is_array($columns)) {
            return $this->defaults($collection);
        }

        $collection->loadMissing('fields');
        $fieldsByName = $collection->fields->keyBy('name');
        $relatedCatalog = $this->relatedFieldsCatalog($collection);

        $out = [];
        $seen = [];

        foreach ($columns as $raw) {
            if (! is_string($raw)) {
                continue;
            }

            $path = trim($raw);
            if ($path === '' || isset($seen[$path])) {
                continue;
            }

            if (! $this->isValidPath($path, $fieldsByName, $relatedCatalog)) {
                continue;
            }

            $seen[$path] = true;
            $out[] = $path;
        }

        return $out === [] ? $this->defaults($collection) : $out;
    }

    /**
     * Default columns when the user has no preference stored.
     *
     * @return list<string>
     */
    public function defaults(Collection $collection): array
    {
        $collection->loadMissing('fields');

        $preferred = [];
        $rest = [];

        foreach ($collection->fields as $field) {
            if (! $field instanceof CollectionField) {
                continue;
            }

            $type = $field->type instanceof FieldTypeEnum
                ? $field->type->value
                : (string) $field->type;

            if (! in_array($type, self::LIST_FRIENDLY_TYPES, true)) {
                continue;
            }

            if (in_array($field->name, self::PREFERRED_NAMES, true)) {
                $preferred[] = $field->name;
            } else {
                $rest[] = $field->name;
            }
        }

        $picked = array_slice([...$preferred, ...$rest], 0, self::DEFAULT_FIELD_LIMIT);

        return ['id', ...$picked];
    }

    /**
     * Catalog of selectable nested fields for each relation/file column.
     *
     * @return array<string, list<array{name: string, display_name: string, type: string}>>
     */
    public function relatedFieldsCatalog(Collection $collection): array
    {
        $collection->loadMissing('fields');
        $catalog = [];

        foreach ($collection->fields as $field) {
            if (! $field instanceof CollectionField) {
                continue;
            }

            $type = $this->fieldType($field);
            if ($type === null) {
                continue;
            }

            if ($this->isFileType($type)) {
                $catalog[$field->name] = [
                    ['name' => 'id', 'display_name' => 'ID', 'type' => 'string'],
                    ['name' => 'filename_download', 'display_name' => 'Filename', 'type' => 'string'],
                    ['name' => 'type', 'display_name' => 'Type', 'type' => 'string'],
                    ['name' => 'filesize', 'display_name' => 'Filesize', 'type' => 'number'],
                ];

                continue;
            }

            if (! $type->isRelationType()) {
                continue;
            }

            $relatedId = (int) data_get($field->settings, 'related_collection_id');
            if ($relatedId <= 0) {
                $catalog[$field->name] = [];

                continue;
            }

            $related = Collection::query()->with(['fields' => fn ($q) => $q->ordered()])->find($relatedId);
            if ($related === null) {
                $catalog[$field->name] = [];

                continue;
            }

            $entries = [];
            foreach ($related->fields as $relatedField) {
                if (! $relatedField instanceof CollectionField) {
                    continue;
                }

                $relatedType = $this->fieldType($relatedField);
                $entries[] = [
                    'name' => $relatedField->name,
                    'display_name' => $relatedField->displayName(),
                    'type' => $relatedType?->value ?? (string) $relatedField->type,
                ];
            }

            $catalog[$field->name] = $entries;
        }

        return $catalog;
    }

    public function isFileType(FieldTypeEnum $type): bool
    {
        return in_array($type, [FieldTypeEnum::Image, FieldTypeEnum::File, FieldTypeEnum::Files], true);
    }

    /**
     * @param  \Illuminate\Support\Collection<string, CollectionField>  $fieldsByName
     * @param  array<string, list<array{name: string, display_name: string, type: string}>>  $relatedCatalog
     */
    private function isValidPath(string $path, $fieldsByName, array $relatedCatalog): bool
    {
        if (in_array($path, self::SYSTEM_COLUMNS, true)) {
            return true;
        }

        if (! str_contains($path, '.')) {
            return $fieldsByName->has($path);
        }

        // Nested: exactly one level.
        $parts = explode('.', $path);
        if (count($parts) !== 2) {
            return false;
        }

        [$parent, $child] = $parts;
        if ($parent === '' || $child === '') {
            return false;
        }

        $field = $fieldsByName->get($parent);
        if (! $field instanceof CollectionField) {
            return false;
        }

        $type = $this->fieldType($field);
        if ($type === null) {
            return false;
        }

        if (! $type->isRelationType() && ! $this->isFileType($type)) {
            return false;
        }

        $children = $relatedCatalog[$parent] ?? [];
        foreach ($children as $entry) {
            if (($entry['name'] ?? null) === $child) {
                return true;
            }
        }

        return false;
    }

    private function fieldType(CollectionField $field): ?FieldTypeEnum
    {
        return $field->type instanceof FieldTypeEnum
            ? $field->type
            : FieldTypeEnum::tryFrom((string) $field->type);
    }
}

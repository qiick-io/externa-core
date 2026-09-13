<?php

namespace App\Services\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\File;
use App\Support\Collections\CollectionItemDataAccessor;
use App\Support\Collections\CollectionLocaleResolver;

/**
 * Batch-resolve relation/file labels (and nested 1-level values) for item list rows.
 */
class CollectionListDisplayEnricher
{
    private const MULTI_LABEL_LIMIT = 3;

    public function __construct(
        private CollectionItemOptionsService $optionsService,
        private CollectionItemDataAccessor $itemDataAccessor,
        private CollectionLocaleResolver $localeResolver,
    ) {}

    /**
     * @param  list<array<string, mixed>>  $rows
     * @param  list<string>  $listColumns
     * @return list<array<string, mixed>>
     */
    public function enrich(Collection $collection, array $rows, array $listColumns): array
    {
        if ($rows === [] || $listColumns === []) {
            return $rows;
        }

        $collection->loadMissing('fields');
        $fieldsByName = $collection->fields->keyBy('name');

        $needed = $this->pathsNeedingDisplay($listColumns, $fieldsByName);
        if ($needed === []) {
            return array_map(static function (array $row): array {
                $row['displays'] ??= [];
                $row['thumbs'] ??= [];

                return $row;
            }, $rows);
        }

        $fileIds = [];
        $itemIdsByCollection = [];

        foreach ($rows as $row) {
            $data = is_array($row['data'] ?? null) ? $row['data'] : [];
            foreach ($needed as $path => $meta) {
                /** @var CollectionField $field */
                $field = $meta['field'];
                $type = $meta['type'];
                $raw = $data[$field->name] ?? null;
                $ids = $this->normalizeIds($raw, $type);

                if ($this->isFileType($type)) {
                    foreach ($ids as $id) {
                        $fileIds[$id] = true;
                    }

                    continue;
                }

                $relatedCollectionId = (int) data_get($field->settings, 'related_collection_id');
                if ($relatedCollectionId <= 0) {
                    continue;
                }

                foreach ($ids as $id) {
                    $itemIdsByCollection[$relatedCollectionId][$id] = true;
                }
            }
        }

        $filesById = $fileIds === []
            ? collect()
            : File::query()->whereIn('id', array_keys($fileIds))->get()->keyBy('id');

        $itemsById = collect();
        foreach ($itemIdsByCollection as $relatedCollectionId => $idMap) {
            $loaded = CollectionItem::query()
                ->where('collection_id', $relatedCollectionId)
                ->whereIn('id', array_keys($idMap))
                ->with(['collection.fields'])
                ->get();
            foreach ($loaded as $item) {
                $itemsById[$item->id] = $item;
            }
        }

        $locale = $this->localeResolver->resolve();

        return array_map(function (array $row) use ($needed, $filesById, $itemsById, $locale): array {
            $data = is_array($row['data'] ?? null) ? $row['data'] : [];
            $displays = [];
            $thumbs = [];

            foreach ($needed as $path => $meta) {
                /** @var CollectionField $field */
                $field = $meta['field'];
                $type = $meta['type'];
                $child = $meta['child'];
                $raw = $data[$field->name] ?? null;
                $ids = $this->normalizeIds($raw, $type);

                if ($this->isFileType($type)) {
                    $displays[$path] = $this->formatFileDisplay($ids, $filesById, $child);
                    if ($child === null && $type === FieldTypeEnum::Image && count($ids) === 1) {
                        $file = $filesById->get($ids[0]);
                        if ($file instanceof File && $file->isFile() && is_string($file->mime_type) && str_starts_with($file->mime_type, 'image/')) {
                            $thumbs[$path] = route('files.thumbnail', $file);
                        }
                    }

                    continue;
                }

                $displays[$path] = $this->formatRelationDisplay($ids, $itemsById, $field, $child, $locale);
            }

            $row['displays'] = $displays;
            $row['thumbs'] = $thumbs;

            return $row;
        }, $rows);
    }

    /**
     * @param  \Illuminate\Support\Collection<string, CollectionField>  $fieldsByName
     * @param  list<string>  $listColumns
     * @return array<string, array{field: CollectionField, type: FieldTypeEnum, child: string|null}>
     */
    private function pathsNeedingDisplay(array $listColumns, $fieldsByName): array
    {
        $needed = [];

        foreach ($listColumns as $path) {
            $parent = $path;
            $child = null;
            if (str_contains($path, '.')) {
                $parts = explode('.', $path, 2);
                $parent = $parts[0];
                $child = $parts[1] ?? null;
            }

            $field = $fieldsByName->get($parent);
            if (! $field instanceof CollectionField) {
                continue;
            }

            $type = $field->type instanceof FieldTypeEnum
                ? $field->type
                : FieldTypeEnum::tryFrom((string) $field->type);

            if ($type === null) {
                continue;
            }

            if (! $type->isRelationType() && ! $this->isFileType($type)) {
                continue;
            }

            // Bare scalar-ish columns don't need enricher; relation/file always do.
            $needed[$path] = [
                'field' => $field,
                'type' => $type,
                'child' => $child,
            ];
        }

        return $needed;
    }

    /**
     * @return list<int>
     */
    private function normalizeIds(mixed $raw, FieldTypeEnum $type): array
    {
        if ($raw === null || $raw === '') {
            return [];
        }

        $multiple = $type->isMultipleRelationType() || $type === FieldTypeEnum::Files;

        if ($multiple) {
            if (! is_array($raw)) {
                $raw = [$raw];
            }

            $ids = [];
            foreach ($raw as $entry) {
                if (is_numeric($entry)) {
                    $ids[] = (int) $entry;
                }
            }

            return array_values(array_unique($ids));
        }

        if (is_numeric($raw)) {
            return [(int) $raw];
        }

        return [];
    }

    /**
     * @param  list<int>  $ids
     * @param  \Illuminate\Support\Collection<int, File>  $filesById
     */
    private function formatFileDisplay(array $ids, $filesById, ?string $child): ?string
    {
        if ($ids === []) {
            return null;
        }

        $labels = [];
        foreach ($ids as $id) {
            $file = $filesById->get($id);
            if (! $file instanceof File) {
                $labels[] = '#'.$id;

                continue;
            }

            $labels[] = $child === null
                ? $this->fileLabel($file)
                : ($this->fileMeta($file, $child) ?? '#'.$id);
        }

        return $this->joinLabels($labels);
    }

    /**
     * @param  list<int>  $ids
     * @param  \Illuminate\Support\Collection<int, CollectionItem>  $itemsById
     */
    private function formatRelationDisplay(
        array $ids,
        $itemsById,
        CollectionField $field,
        ?string $child,
        string $locale,
    ): ?string {
        if ($ids === []) {
            return null;
        }

        $displayField = (string) (data_get($field->settings, 'display_field') ?: 'id');
        $displayTemplate = data_get($field->settings, 'display_template');
        $template = is_string($displayTemplate) ? $displayTemplate : null;

        $labels = [];
        foreach ($ids as $id) {
            $item = $itemsById->get($id);
            if (! $item instanceof CollectionItem) {
                $labels[] = '#'.$id;

                continue;
            }

            if ($child === null) {
                $labels[] = $this->optionsService->resolveLabel($item, $displayField, $template);

                continue;
            }

            if ($child === 'id') {
                $labels[] = (string) $item->id;

                continue;
            }

            $data = $this->itemDataAccessor->flattenForLocale($item, $locale, false);
            $value = $data[$child] ?? null;
            if (is_scalar($value) && $value !== '') {
                $labels[] = (string) $value;
            } else {
                $labels[] = '#'.$item->id;
            }
        }

        return $this->joinLabels($labels);
    }

    private function fileLabel(File $file): string
    {
        $name = $file->download_name ?: $file->name;

        return is_string($name) && $name !== '' ? $name : '#'.$file->id;
    }

    private function fileMeta(File $file, string $child): ?string
    {
        return match ($child) {
            'id' => (string) $file->id,
            'filename_download' => $this->fileLabel($file),
            'type' => $file->mime_type ?: $file->type->value,
            'filesize' => $file->size !== null ? (string) $file->size : null,
            default => null,
        };
    }

    /**
     * @param  list<string>  $labels
     */
    private function joinLabels(array $labels): ?string
    {
        if ($labels === []) {
            return null;
        }

        $shown = array_slice($labels, 0, self::MULTI_LABEL_LIMIT);
        $extra = count($labels) - count($shown);
        $text = implode(', ', $shown);
        if ($extra > 0) {
            $text .= ' +'.$extra;
        }

        return $text;
    }

    private function isFileType(FieldTypeEnum $type): bool
    {
        return in_array($type, [FieldTypeEnum::Image, FieldTypeEnum::Files], true);
    }
}

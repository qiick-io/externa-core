<?php

namespace App\Services\Collections;

use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemValue;
use Illuminate\Support\Collection;

/**
 * Builds the in-memory `data` shape for collection item forms/API from `collections_items_values` rows.
 */
class CollectionItemValuesAssembler
{
    /**
     * @return array<string, mixed>
     */
    public function assemble(CollectionItem $item): array
    {
        $item->loadMissing(['collection.fields', 'fieldValues']);

        $collection = $item->collection;
        if ($collection === null) {
            return [];
        }

        $data = [];

        foreach ($collection->fields as $field) {
            $rows = $item->fieldValues->where('field_id', $field->id)->values();
            if ($rows->isEmpty()) {
                continue;
            }

            if ($field->translatable) {
                $data[$field->name] = $this->assembleTranslatable($field, $rows);

                continue;
            }

            $data[$field->name] = $this->assembleNonTranslatable($field, $rows);
        }

        return $data;
    }

    /**
     * @param  Collection<int, CollectionItemValue>  $rows
     * @return array<string, mixed>
     */
    private function assembleTranslatable(CollectionField $field, $rows): array
    {
        if ($field->type->isArrayStorage()) {
            $out = [];
            foreach ($rows->groupBy('locale') as $locale => $localeRows) {
                /** @var string $locale */
                $out[$locale] = $localeRows->sortBy('position')->values()->map(fn ($r) => $r->value)->all();
            }

            return $out;
        }

        $out = [];
        foreach ($rows->groupBy('locale') as $locale => $localeRows) {
            /** @var string $locale */
            $row = $localeRows->firstWhere('position', 0);
            $out[$locale] = $row?->value;
        }

        return $out;
    }

    /**
     * @param  Collection<int, CollectionItemValue>  $rows
     */
    private function assembleNonTranslatable(CollectionField $field, $rows): mixed
    {
        if ($field->type->isArrayStorage()) {
            return $rows->whereNull('locale')->sortBy('position')->values()->map(fn ($r) => $r->value)->all();
        }

        $row = $rows->whereNull('locale')->firstWhere('position', 0);

        return $row?->value;
    }
}

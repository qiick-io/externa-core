<?php

namespace App\Services\Collections;

use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemValue;

class CollectionItemValuesWriter
{
    /**
     * Persist normalized field data as rows in `collections_items_values`.
     *
     * @param  array<string, mixed>  $normalizedData
     */
    public function sync(CollectionItem $item, Collection $collection, array $normalizedData): void
    {
        $collection->loadMissing('fields');

        CollectionItemValue::query()->where('item_id', $item->id)->delete();

        foreach ($collection->fields as $field) {
            if (! array_key_exists($field->name, $normalizedData)) {
                continue;
            }

            $value = $normalizedData[$field->name];

            if ($field->translatable) {
                $this->syncTranslatable($item, $field, is_array($value) ? $value : []);

                continue;
            }

            $this->syncNonTranslatable($item, $field, $value);
        }
    }

    /**
     * @param  array<string, mixed>  $perLocale
     */
    private function syncTranslatable(CollectionItem $item, CollectionField $field, array $perLocale): void
    {
        foreach ($perLocale as $locale => $localeValue) {
            if ($field->usesArrayStorage()) {
                $list = is_array($localeValue) ? $localeValue : [];
                foreach ($list as $position => $entry) {
                    $this->insertRow($item, $field, $locale, (int) $position, $entry);
                }

                continue;
            }

            $this->insertRow($item, $field, $locale, 0, $localeValue);
        }
    }

    private function syncNonTranslatable(CollectionItem $item, CollectionField $field, mixed $value): void
    {
        if ($field->usesArrayStorage()) {
            $list = is_array($value) ? $value : [];
            foreach ($list as $position => $entry) {
                $this->insertRow($item, $field, null, (int) $position, $entry);
            }

            return;
        }

        $this->insertRow($item, $field, null, 0, $value);
    }

    private function insertRow(CollectionItem $item, CollectionField $field, ?string $locale, int $position, mixed $value): void
    {
        if ($value === null) {
            return;
        }

        CollectionItemValue::query()->create([
            'item_id' => $item->id,
            'field_id' => $field->id,
            'locale' => $locale,
            'position' => $position,
            'value' => $value,
        ]);
    }
}

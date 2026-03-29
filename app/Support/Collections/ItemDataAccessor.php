<?php

namespace App\Support\Collections;

use App\Models\CollectionItem;
use App\Services\Collections\CollectionItemValuesAssembler;

class ItemDataAccessor
{
    public function __construct(
        private LocaleResolver $localeResolver,
        private CollectionItemValuesAssembler $collectionItemValuesAssembler,
    ) {}

    public function getTranslated(CollectionItem $item, string $field, ?string $locale = null): mixed
    {
        $data = $this->collectionItemValuesAssembler->assemble($item);
        if (! array_key_exists($field, $data)) {
            return null;
        }

        $value = $data[$field];

        if (! is_array($value)) {
            return $value;
        }

        $locale ??= $this->localeResolver->resolve();

        foreach ($this->localeResolver->fallbackChain($locale) as $tryLocale) {
            if (array_key_exists($tryLocale, $value) && $value[$tryLocale] !== null && $value[$tryLocale] !== '') {
                return $value[$tryLocale];
            }
        }

        return null;
    }

    /**
     * Build a flat representation of item data for API/Inertia using field definitions.
     *
     * @return array<string, mixed>
     */
    public function flattenForLocale(CollectionItem $item, string $locale, bool $includeAllTranslations): array
    {
        $item->loadMissing('collection.fields');

        $data = $this->collectionItemValuesAssembler->assemble($item);

        $fields = $item->collection?->fields;
        if ($fields === null || $fields->isEmpty()) {
            return $data;
        }

        $out = [];
        foreach ($fields as $field) {
            $key = $field->name;
            if (! array_key_exists($key, $data)) {
                continue;
            }

            $raw = $data[$key];

            if (! $field->translatable) {
                $out[$key] = $raw;

                continue;
            }

            if ($includeAllTranslations && is_array($raw)) {
                $out[$key] = $raw;
            } else {
                $out[$key] = $this->getTranslated($item, $key, $locale);
            }
        }

        return $out;
    }
}

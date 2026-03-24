<?php

namespace App\Support\Cms;

use App\Models\Item;

class ItemDataAccessor
{
    public function __construct(
        private LocaleResolver $localeResolver,
    ) {}

    public function getTranslated(Item $item, string $field, ?string $locale = null): mixed
    {
        $data = $item->data ?? [];
        if (! is_array($data) || ! array_key_exists($field, $data)) {
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

    public function setTranslated(Item $item, string $field, string $locale, mixed $value): void
    {
        $data = $item->data ?? [];
        if (! is_array($data)) {
            $data = [];
        }

        $current = $data[$field] ?? [];
        if (! is_array($current)) {
            $current = [];
        }

        $current[$locale] = $value;
        $data[$field] = $current;

        $item->data = $data;
    }

    /**
     * Build a flat representation of item data for API/Inertia using field definitions.
     *
     * @return array<string, mixed>
     */
    public function flattenForLocale(Item $item, string $locale, bool $includeAllTranslations): array
    {
        $data = $item->data ?? [];
        if (! is_array($data)) {
            return [];
        }

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

<?php

namespace App\Services\Cms;

use App\Enums\FieldType;
use App\Models\ContentCollection;
use App\Models\Field;

class ItemDataNormalizer
{
    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function normalize(ContentCollection $collection, array $data): array
    {
        $collection->loadMissing('fields');

        $out = [];

        foreach ($collection->fields as $field) {
            if (! array_key_exists($field->name, $data)) {
                continue;
            }

            $value = $data[$field->name];

            if ($field->translatable) {
                $out[$field->name] = $this->normalizeTranslatable($field, $value);
            } else {
                $out[$field->name] = $this->normalizeScalar($field, $value);
            }
        }

        return $out;
    }

    /**
     * @param  array<string, mixed>|mixed  $value
     * @return array<string, mixed>
     */
    private function normalizeTranslatable(Field $field, mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $locales = $this->allowedLocales();
        $out = [];

        foreach ($locales as $locale) {
            if (! array_key_exists($locale, $value)) {
                continue;
            }

            $v = $value[$locale];

            $out[$locale] = match ($field->type) {
                FieldType::Tag,
                FieldType::Multiselect => $this->normalizeStringArray($v),
                FieldType::Number => is_numeric($v) ? 0 + $v : null,
                FieldType::Boolean => is_bool($v) ? $v : null,
                FieldType::String,
                FieldType::Textarea,
                FieldType::Markdown,
                FieldType::Code,
                FieldType::Select,
                FieldType::RadioGroup,
                FieldType::Date,
                FieldType::Color => is_string($v) ? $v : null,
            };
        }

        return $out;
    }

    private function normalizeScalar(Field $field, mixed $value): mixed
    {
        return match ($field->type) {
            FieldType::String,
            FieldType::Textarea,
            FieldType::Markdown,
            FieldType::Code,
            FieldType::Select,
            FieldType::RadioGroup,
            FieldType::Date,
            FieldType::Color => is_string($value) ? $value : null,
            FieldType::Number => is_numeric($value) ? 0 + $value : null,
            FieldType::Boolean => is_bool($value) ? $value : null,
            FieldType::Multiselect,
            FieldType::Tag => $this->normalizeStringArray($value),
        };
    }

    /**
     * @return list<string>
     */
    private function normalizeStringArray(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $out = [];
        foreach ($value as $v) {
            if (is_string($v) && $v !== '') {
                $out[] = $v;
            }
        }

        return $out;
    }

    /**
     * @return list<string>
     */
    private function allowedLocales(): array
    {
        $locales = config('cms.locales', ['en']);

        return is_array($locales) ? array_values(array_filter($locales, fn ($l) => is_string($l))) : ['en'];
    }
}

<?php

namespace App\Services\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;

class CollectionItemDataNormalizer
{
    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function normalize(Collection $collection, array $data): array
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
    private function normalizeTranslatable(CollectionField $field, mixed $value): array
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
                FieldTypeEnum::Tag,
                FieldTypeEnum::Multiselect => $this->normalizeStringArray($v),
                FieldTypeEnum::Number => is_numeric($v) ? 0 + $v : null,
                FieldTypeEnum::Boolean => $this->normalizeBoolean($v),
                FieldTypeEnum::String,
                FieldTypeEnum::Textarea,
                FieldTypeEnum::Markdown,
                FieldTypeEnum::Code,
                FieldTypeEnum::Select,
                FieldTypeEnum::RadioGroup,
                FieldTypeEnum::Date,
                FieldTypeEnum::Color => is_string($v) ? $v : null,
                FieldTypeEnum::Image,
                FieldTypeEnum::File => $this->normalizeFileId($v),
                FieldTypeEnum::Relation => $this->normalizeRelationId($v),
                FieldTypeEnum::RelationMany => $this->normalizeIntegerArray($v),
            };
        }

        return $out;
    }

    private function normalizeScalar(CollectionField $field, mixed $value): mixed
    {
        return match ($field->type) {
            FieldTypeEnum::String,
            FieldTypeEnum::Textarea,
            FieldTypeEnum::Markdown,
            FieldTypeEnum::Code,
            FieldTypeEnum::Select,
            FieldTypeEnum::RadioGroup,
            FieldTypeEnum::Date,
            FieldTypeEnum::Color => is_string($value) ? $value : null,
            FieldTypeEnum::Number => is_numeric($value) ? 0 + $value : null,
            FieldTypeEnum::Boolean => $this->normalizeBoolean($value),
            FieldTypeEnum::Multiselect,
            FieldTypeEnum::Tag => $this->normalizeStringArray($value),
            FieldTypeEnum::Image,
            FieldTypeEnum::File => $this->normalizeFileId($value),
            FieldTypeEnum::Relation => $this->normalizeRelationId($value),
            FieldTypeEnum::RelationMany => $this->normalizeIntegerArray($value),
        };
    }

    /**
     * HTML forms and JSON payloads often send booleans as "0"/"1" strings or 0/1 integers.
     */
    private function normalizeBoolean(mixed $value): ?bool
    {
        if (is_bool($value)) {
            return $value;
        }

        if (is_int($value) || is_float($value)) {
            if ($value === 1 || $value === 1.0) {
                return true;
            }
            if ($value === 0 || $value === 0.0) {
                return false;
            }

            return null;
        }

        if (is_string($value)) {
            $trimmed = strtolower(trim($value));
            if (in_array($trimmed, ['1', 'true', 'on', 'yes'], true)) {
                return true;
            }
            if (in_array($trimmed, ['0', 'false', 'off', 'no', ''], true)) {
                return false;
            }
        }

        return null;
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

    private function normalizeFileId(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_numeric($value)) {
            return (int) $value;
        }

        return null;
    }

    private function normalizeRelationId(mixed $value): ?int
    {
        if (is_array($value) && isset($value['related_item_id'])) {
            return is_numeric($value['related_item_id'])
                ? (int) $value['related_item_id']
                : null;
        }

        return $this->normalizeFileId($value);
    }

    /**
     * @return list<int>
     */
    private function normalizeIntegerArray(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $out = [];
        foreach ($value as $entry) {
            if (is_numeric($entry)) {
                $out[] = (int) $entry;
            }
        }

        return $out;
    }

    /**
     * @return list<string>
     */
    private function allowedLocales(): array
    {
        $locales = config('collections.locales', ['en']);

        return is_array($locales) ? array_values(array_filter($locales, fn ($l) => is_string($l))) : ['en'];
    }
}

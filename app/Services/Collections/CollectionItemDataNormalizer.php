<?php

namespace App\Services\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Support\Collections\CollectionLocaleResolver;
use Illuminate\Support\Str;

/**
 * Coerces inbound item payloads to storable shapes per field type and locale.
 */
class CollectionItemDataNormalizer
{
    public function __construct(
        private CollectionLocaleResolver $localeResolver,
    ) {}
    /**
     * Normalize raw item data against the collection field definitions.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function normalize(Collection $collection, array $data, bool $creating = false): array
    {
        $collection->loadMissing('fields');

        $out = [];

        foreach ($collection->fields as $field) {
            if (! array_key_exists($field->name, $data)) {
                if ($creating) {
                    $defaultValue = $field->defaultValue();
                    if ($defaultValue !== null && $defaultValue !== '') {
                        $out[$field->name] = $field->translatable
                            ? $this->defaultTranslatableValue($field, $defaultValue)
                            : $this->normalizeFieldValue($field, $defaultValue);
                    }
                }

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
     * @return array<string, mixed>
     */
    private function defaultTranslatableValue(CollectionField $field, mixed $defaultValue): array
    {
        $out = [];
        foreach ($this->allowedLocales() as $locale) {
            $out[$locale] = $this->normalizeFieldValue($field, $defaultValue);
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

            $out[$locale] = $this->normalizeFieldValue($field, $v);
        }

        return $out;
    }

    private function normalizeScalar(CollectionField $field, mixed $value): mixed
    {
        return $this->normalizeFieldValue($field, $value);
    }

    private function normalizeFieldValue(CollectionField $field, mixed $value): mixed
    {
        return match ($field->type) {
            FieldTypeEnum::String,
            FieldTypeEnum::Autocomplete,
            FieldTypeEnum::ApiAutocomplete,
            FieldTypeEnum::Textarea,
            FieldTypeEnum::Wysiwyg,
            FieldTypeEnum::Markdown,
            FieldTypeEnum::Code,
            FieldTypeEnum::Select,
            FieldTypeEnum::RadioGroup,
            FieldTypeEnum::Date,
            FieldTypeEnum::Color => $this->normalizeStringValue($field, is_string($value) ? $value : null),
            FieldTypeEnum::Hash => $this->normalizeHash($value),
            FieldTypeEnum::Number => is_numeric($value) ? 0 + $value : null,
            FieldTypeEnum::Slider => is_numeric($value) ? 0 + $value : null,
            FieldTypeEnum::Boolean => $this->normalizeBoolean($value),
            FieldTypeEnum::Multiselect,
            FieldTypeEnum::CheckboxGroup,
            FieldTypeEnum::CheckboxGroupTree,
            FieldTypeEnum::Tag => $this->normalizeSelectionArray($field, $value),
            FieldTypeEnum::Map => $this->normalizeMapCoordinates($value),
            FieldTypeEnum::Image => $field->usesArrayStorage()
                ? $this->normalizeIntegerArray($value)
                : $this->normalizeFileId($value),
            FieldTypeEnum::File => $this->normalizeFileId($value),
            FieldTypeEnum::Files => $this->normalizeIntegerArray($value),
            FieldTypeEnum::M2a => $this->normalizeM2aBlocks($value),
            FieldTypeEnum::Relation,
            FieldTypeEnum::ManyToOne,
            FieldTypeEnum::RelationTree => $this->normalizeRelationId($value),
            FieldTypeEnum::RelationMany,
            FieldTypeEnum::OneToMany,
            FieldTypeEnum::ManyToMany => $this->normalizeIntegerArray($value),
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
     * @return array{lat: float|null, lng: float|null}|null
     */
    private function normalizeMapCoordinates(mixed $value): ?array
    {
        if (! is_array($value)) {
            return null;
        }

        $lat = $value['lat'] ?? null;
        $lng = $value['lng'] ?? null;

        if ($lat === null || $lat === '' || $lng === null || $lng === '') {
            return null;
        }

        if (! is_numeric($lat) || ! is_numeric($lng)) {
            return null;
        }

        return [
            'lat' => (float) $lat,
            'lng' => (float) $lng,
        ];
    }

    private function normalizeStringValue(CollectionField $field, ?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        if (CollectionField::settingsFlagIsEnabled(data_get($field->settings, 'trim', false))) {
            $value = trim($value);
        }

        if (CollectionField::settingsFlagIsEnabled(data_get($field->settings, 'slugify', false))) {
            $value = Str::slug($value);
        }

        return $value === '' ? null : $value;
    }

    /**
     * @return list<string>
     */
    private function normalizeSelectionArray(CollectionField $field, mixed $value): array
    {
        if ($field->type === FieldTypeEnum::Tag) {
            return $this->normalizeTagArray($field, $value);
        }

        $selected = $this->normalizeStringArray($value);

        if ($field->type === FieldTypeEnum::CheckboxGroupTree) {
            return $this->normalizeCheckboxGroupTree($field, $selected);
        }

        return $selected;
    }

    /**
     * @param  list<string>  $selected
     * @return list<string>
     */
    private function normalizeCheckboxGroupTree(CollectionField $field, array $selected): array
    {
        if (data_get($field->settings, 'value_combining') !== 'leaf') {
            return $selected;
        }

        $leafValues = $this->collectTreeLeafValues(data_get($field->settings, 'options', []));

        if ($leafValues === []) {
            return $selected;
        }

        return array_values(array_intersect($selected, $leafValues));
    }

    /**
     * @return list<string>
     */
    private function collectTreeLeafValues(mixed $options): array
    {
        if (! is_array($options)) {
            return [];
        }

        $leafValues = [];

        foreach ($options as $option) {
            if (! is_array($option)) {
                continue;
            }

            $value = isset($option['value']) ? (string) $option['value'] : '';
            $children = $option['children'] ?? [];
            $childRows = is_array($children) ? $children : [];

            if ($childRows !== []) {
                array_push($leafValues, ...$this->collectTreeLeafValues($childRows));

                continue;
            }

            if ($value !== '') {
                $leafValues[] = $value;
            }
        }

        return $leafValues;
    }

    /**
     * @return list<string>
     */
    private function normalizeTagArray(CollectionField $field, mixed $value): array
    {
        $tags = $this->normalizeStringArray($value);

        if (CollectionField::settingsFlagIsEnabled(data_get($field->settings, 'lowercase', false))) {
            $tags = array_map(static fn (string $tag): string => strtolower($tag), $tags);
        }

        if (CollectionField::settingsFlagIsEnabled(data_get($field->settings, 'alphabetize', false))) {
            sort($tags);
        }

        return $tags;
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
     * @return list<array{related_collection_id: int, related_item_id: int}>
     */
    private function normalizeM2aBlocks(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $out = [];

        foreach ($value as $entry) {
            if (! is_array($entry)) {
                continue;
            }

            $relatedCollectionId = $entry['related_collection_id'] ?? null;
            $relatedItemId = $entry['related_item_id'] ?? null;

            if (! is_numeric($relatedCollectionId) || ! is_numeric($relatedItemId)) {
                continue;
            }

            $out[] = [
                'related_collection_id' => (int) $relatedCollectionId,
                'related_item_id' => (int) $relatedItemId,
            ];
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

    private function normalizeHash(mixed $value): string
    {
        if (is_string($value) && trim($value) !== '') {
            return trim($value);
        }

        return hash('sha256', (string) Str::uuid());
    }

    /**
     * @return list<string>
     */
    private function allowedLocales(): array
    {
        return $this->localeResolver->allowedLocales();
    }
}

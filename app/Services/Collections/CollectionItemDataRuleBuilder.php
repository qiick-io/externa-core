<?php

namespace App\Services\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;
use Illuminate\Validation\Rules\In;

/**
 * Builds Laravel validation rules for collection item data payloads.
 */
class CollectionItemDataRuleBuilder
{
    public function __construct(
        private FieldValidationRuleEvaluator $validationRuleEvaluator,
    ) {}

    /**
     * Validation rules for the full data payload on create or update.
     *
     * @return array<string, mixed>
     */
    public function rules(Collection $collection, bool $creating, ?int $excludeItemId = null): array
    {
        $collection->loadMissing('fields');

        $rules = [
            'data' => $creating ? ['present', 'array'] : ['sometimes', 'array'],
        ];

        foreach ($collection->fields as $field) {
            if ($field->isHiddenInForm()) {
                continue;
            }

            $rules = array_merge($rules, $this->rulesForField($field, $creating, $excludeItemId));
        }

        return $rules;
    }

    /**
     * @return array<string, mixed>
     */
    private function rulesForField(CollectionField $field, bool $creating, ?int $excludeItemId): array
    {
        $prefix = 'data.'.$field->name;
        $presence = $this->presenceRule($field, $creating);

        if ($field->translatable) {
            $rules = [
                $prefix => [$presence, 'array'],
            ];
            foreach ($this->allowedLocales() as $locale) {
                $rules = array_merge(
                    $rules,
                    $this->rulesForTranslatableLocale(
                        $field,
                        $prefix.'.'.$locale,
                        $this->fieldIsRequired($field),
                        $excludeItemId,
                    )
                );
            }

            return $rules;
        }

        $rules = [
            $prefix => array_merge(
                [$presence],
                $this->nonTranslatableRules($field, $this->fieldIsRequired($field), $excludeItemId),
            ),
        ];

        if (in_array($field->type, [
            FieldTypeEnum::Tag,
            FieldTypeEnum::Multiselect,
            FieldTypeEnum::CheckboxGroup,
            FieldTypeEnum::CheckboxGroupTree,
        ], true)) {
            $rules[$prefix.'.*'] = ['string', 'max:1024'];
        }

        if ($field->type->isMultipleRelationType()) {
            $rules[$prefix.'.*'] = ['integer', $this->relatedItemExistsRule($field)];
        }

        if ($field->type === FieldTypeEnum::Files
            || ($field->type === FieldTypeEnum::Image && $field->usesArrayStorage())) {
            $rules[$prefix.'.*'] = ['integer', Rule::exists('files', 'id')];
        }

        if ($field->type === FieldTypeEnum::M2a) {
            $rules[$prefix.'.*'] = ['array'];
            $rules[$prefix.'.*.related_collection_id'] = ['required', 'integer', Rule::exists('collections', 'id')];
            $rules[$prefix.'.*.related_item_id'] = ['required', 'integer', Rule::exists('collections_items', 'id')];
        }

        if ($field->type === FieldTypeEnum::Map) {
            $rules[$prefix.'.lat'] = ['nullable', 'numeric', 'between:-90,90'];
            $rules[$prefix.'.lng'] = ['nullable', 'numeric', 'between:-180,180'];
        }

        return $rules;
    }

    /**
     * @return array<string, mixed>
     */
    private function rulesForTranslatableLocale(
        CollectionField $field,
        string $prefix,
        bool $required,
        ?int $excludeItemId,
    ): array {
        $presence = $required ? 'required' : 'nullable';
        $extraRules = $this->validationRuleEvaluator->rulesForField($field, $prefix, $excludeItemId);

        return match ($field->type) {
            FieldTypeEnum::Tag,
            FieldTypeEnum::Multiselect,
            FieldTypeEnum::CheckboxGroup,
            FieldTypeEnum::CheckboxGroupTree => [
                $prefix => array_merge([$presence, 'array'], $extraRules),
                $prefix.'.*' => ['string', 'max:1024'],
            ],
            FieldTypeEnum::Map => [
                $prefix => [$presence, 'array'],
                $prefix.'.lat' => ['nullable', 'numeric', 'between:-90,90'],
                $prefix.'.lng' => ['nullable', 'numeric', 'between:-180,180'],
            ],
            FieldTypeEnum::Number => [
                $prefix => array_merge([$presence, 'numeric'], $extraRules, $this->numericBoundsRules($field)),
            ],
            FieldTypeEnum::Slider => [
                $prefix => array_merge([$presence, 'numeric'], $this->sliderValueRules($field), $extraRules),
            ],
            FieldTypeEnum::Hash => [
                $prefix => ['nullable', 'string', 'max:128'],
            ],
            FieldTypeEnum::Boolean => [
                $prefix => array_merge([$presence, 'boolean'], $extraRules),
            ],
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
            FieldTypeEnum::Color => [
                $prefix => array_merge(
                    [$presence],
                    $this->stringValueRules($field),
                    $this->optionInRules($field),
                    $extraRules,
                ),
            ],
            FieldTypeEnum::Image => $field->usesArrayStorage()
                ? [$prefix => [$presence, 'array'], $prefix.'.*' => ['integer', Rule::exists('files', 'id')]]
                : [$prefix => [$presence, 'integer', Rule::exists('files', 'id')]],
            FieldTypeEnum::File => [
                $prefix => [$presence, 'integer', Rule::exists('files', 'id')],
            ],
            FieldTypeEnum::Files => [
                $prefix => [$presence, 'array'],
                $prefix.'.*' => ['integer', Rule::exists('files', 'id')],
            ],
            FieldTypeEnum::M2a => [
                $prefix => [$presence, 'array'],
                $prefix.'.*' => ['array'],
                $prefix.'.*.related_collection_id' => ['required', 'integer', Rule::exists('collections', 'id')],
                $prefix.'.*.related_item_id' => ['required', 'integer', Rule::exists('collections_items', 'id')],
            ],
            FieldTypeEnum::Relation,
            FieldTypeEnum::ManyToOne,
            FieldTypeEnum::RelationTree => [
                $prefix => [$presence, 'integer', $this->relatedItemExistsRule($field)],
            ],
            FieldTypeEnum::RelationMany,
            FieldTypeEnum::OneToMany,
            FieldTypeEnum::ManyToMany => [
                $prefix => [$presence, 'array'],
                $prefix.'.*' => ['integer', $this->relatedItemExistsRule($field)],
            ],
        };
    }

    /**
     * @return list<string|ValidationRule>
     */
    private function nonTranslatableRules(
        CollectionField $field,
        bool $required,
        ?int $excludeItemId,
    ): array {
        $presence = $required ? 'required' : 'nullable';
        $extraRules = $this->validationRuleEvaluator->rulesForField($field, 'data.'.$field->name, $excludeItemId);

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
            FieldTypeEnum::Color => array_merge(
                [$presence],
                $this->stringValueRules($field),
                $this->optionInRules($field),
                $extraRules,
            ),
            FieldTypeEnum::Number => array_merge([$presence, 'numeric'], $this->numericBoundsRules($field), $extraRules),
            FieldTypeEnum::Slider => array_merge([$presence, 'numeric'], $this->sliderValueRules($field), $extraRules),
            FieldTypeEnum::Hash => ['nullable', 'string', 'max:128'],
            FieldTypeEnum::Boolean => array_merge([$presence, 'boolean'], $extraRules),
            FieldTypeEnum::Multiselect,
            FieldTypeEnum::CheckboxGroup,
            FieldTypeEnum::CheckboxGroupTree,
            FieldTypeEnum::Tag => array_merge([$presence, 'array'], $extraRules),
            FieldTypeEnum::Map => [$presence, 'array'],
            FieldTypeEnum::Image => $field->usesArrayStorage()
                ? [$presence, 'array']
                : [$presence, 'integer', Rule::exists('files', 'id')],
            FieldTypeEnum::File => [$presence, 'integer', Rule::exists('files', 'id')],
            FieldTypeEnum::Files => [$presence, 'array'],
            FieldTypeEnum::M2a => [$presence, 'array'],
            FieldTypeEnum::Relation,
            FieldTypeEnum::ManyToOne,
            FieldTypeEnum::RelationTree => [$presence, 'integer', $this->relatedItemExistsRule($field)],
            FieldTypeEnum::RelationMany,
            FieldTypeEnum::OneToMany,
            FieldTypeEnum::ManyToMany => [$presence, 'array'],
        };
    }

    /**
     * @return list<string>
     */
    private function sliderValueRules(CollectionField $field): array
    {
        $min = data_get($field->settings, 'min', 0);
        $max = data_get($field->settings, 'max', 100);

        $rules = [];

        if (is_numeric($min)) {
            $rules[] = 'min:'.$min;
        }

        if (is_numeric($max)) {
            $rules[] = 'max:'.$max;
        }

        return $rules;
    }

    /**
     * @return list<string>
     */
    private function stringValueRules(CollectionField $field): array
    {
        $inputType = (string) data_get($field->settings, 'input_type', 'string');
        $maxLength = data_get($field->settings, 'max_length');

        $rules = match ($inputType) {
            'integer', 'bigInteger' => ['integer'],
            'float', 'decimal' => ['numeric'],
            'uuid' => ['uuid'],
            default => ['string'],
        };

        if (is_numeric($maxLength) && (int) $maxLength > 0) {
            $rules[] = 'max:'.(int) $maxLength;
        } elseif (in_array('string', $rules, true)) {
            $rules[] = 'max:65535';
        }

        return $rules;
    }

    /**
     * @return list<string>
     */
    private function numericBoundsRules(CollectionField $field): array
    {
        $rules = [];
        $min = data_get($field->settings, 'min');
        $max = data_get($field->settings, 'max');

        if (is_numeric($min)) {
            $rules[] = 'min:'.$min;
        }

        if (is_numeric($max)) {
            $rules[] = 'max:'.$max;
        }

        return $rules;
    }

    /**
     * @return list<In|string>
     */
    private function optionInRules(CollectionField $field): array
    {
        if (! in_array($field->type, [
            FieldTypeEnum::Select,
            FieldTypeEnum::RadioGroup,
            FieldTypeEnum::Autocomplete,
        ], true)) {
            return [];
        }

        if (CollectionField::settingsFlagIsEnabled(data_get($field->settings, 'allow_other', false))) {
            return [];
        }

        $options = data_get($field->settings, 'options', []);
        if (! is_array($options)) {
            return [];
        }

        $values = [];
        foreach ($options as $option) {
            if (is_array($option) && isset($option['value']) && (string) $option['value'] !== '') {
                $values[] = (string) $option['value'];
            }
        }

        if ($values === []) {
            return [];
        }

        return [Rule::in($values)];
    }

    private function fieldIsRequired(CollectionField $field): bool
    {
        if ($field->isRequired()) {
            return true;
        }

        $rawRules = data_get($field->settings, 'validation_rules', []);
        if (! is_array($rawRules)) {
            return false;
        }

        foreach ($rawRules as $rule) {
            if (is_array($rule) && ($rule['operator'] ?? null) === 'required') {
                return true;
            }
        }

        return false;
    }

    private function presenceRule(CollectionField $field, bool $creating): string
    {
        if ($this->fieldIsRequired($field)) {
            return 'required';
        }

        return $creating ? 'nullable' : 'sometimes';
    }

    private function relatedItemExistsRule(CollectionField $field): Exists
    {
        $relatedCollectionId = data_get($field->settings, 'related_collection_id');

        return Rule::exists('collections_items', 'id')->where(
            fn ($query) => $query->where('collection_id', (int) $relatedCollectionId)
        );
    }

    /**
     * @return list<string>
     */
    private function allowedLocales(): array
    {
        $locales = config('collections.locales', ['en']);

        return is_array($locales) ? array_values(array_filter($locales, fn ($l) => is_string($l))) : ['en'];
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function assertKnownKeysOnly(Collection $collection, array $data): void
    {
        $collection->loadMissing('fields');
        $allowed = $collection->fields->pluck('name')->all();

        foreach (array_keys($data) as $key) {
            if (! in_array($key, $allowed, true)) {
                abort(422, __('Unknown field :key.', ['key' => $key]));
            }
        }
    }
}

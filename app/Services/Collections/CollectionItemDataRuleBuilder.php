<?php

namespace App\Services\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Support\Collections\BlocksFieldSchema;
use App\Support\Collections\CollectionLocaleResolver;
use App\Support\Collections\MapGeometry;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\Validator;
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
        private CollectionLocaleResolver $localeResolver,
        private FieldConditionEvaluator $conditionEvaluator,
        private BlocksFieldSchema $blocksFieldSchema,
    ) {}

    /**
     * Validation rules for the full data payload on create or update.
     *
     * @param  array<string, mixed>|null  $data  Current request data for conditional required
     * @return array<string, mixed>
     */
    public function rules(Collection $collection, bool $creating, ?int $excludeItemId = null, ?array $data = null): array
    {
        $collection->loadMissing('fields');
        $data ??= [];

        $rules = [
            'data' => $creating ? ['present', 'array'] : ['sometimes', 'array'],
        ];

        foreach ($collection->fields as $field) {
            if ($field->isHiddenInForm() || $field->type->isNoData()) {
                continue;
            }

            $rules = array_merge($rules, $this->rulesForField($field, $creating, $excludeItemId, $data));
        }

        return $rules;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function rulesForField(CollectionField $field, bool $creating, ?int $excludeItemId, array $data): array
    {
        $prefix = 'data.'.$field->name;
        $presence = $this->presenceRule($field, $creating, $data);

        if ($field->translatable) {
            $allowedLocales = $this->allowedLocales();
            $isRequired = $this->fieldIsEffectivelyRequired($field, $data);
            $rules = [
                $prefix => [
                    $presence,
                    'array',
                    function (string $attribute, mixed $value, \Closure $fail) use ($allowedLocales, $isRequired): void {
                        if (! is_array($value)) {
                            return;
                        }

                        foreach (array_keys($value) as $locale) {
                            if (! is_string($locale) || ! in_array($locale, $allowedLocales, true)) {
                                $fail(__('Locale :locale is not enabled.', ['locale' => (string) $locale]));
                            }
                        }

                        if ($isRequired) {
                            $hasValue = false;
                            foreach ($allowedLocales as $locale) {
                                $localeValue = $value[$locale] ?? null;
                                if ($this->hasNonEmptyValue($localeValue)) {
                                    $hasValue = true;
                                    break;
                                }
                            }
                            if (! $hasValue) {
                                $fail(__('At least one locale must be filled.'));
                            }
                        }
                    },
                ],
            ];
            foreach ($allowedLocales as $locale) {
                $rules = array_merge(
                    $rules,
                    $this->rulesForTranslatableLocale(
                        $field,
                        $prefix.'.'.$locale,
                        false,
                        $excludeItemId,
                    )
                );
            }

            return $rules;
        }

        $rules = [
            $prefix => array_merge(
                [$presence],
                $this->nonTranslatableRules($field, $this->fieldIsEffectivelyRequired($field, $data), $excludeItemId),
            ),
        ];

        if (in_array($field->type, [
            FieldTypeEnum::Tag,
            FieldTypeEnum::Multiselect,
            FieldTypeEnum::CheckboxGroup,
            FieldTypeEnum::CheckboxGroupTree,
        ], true)) {
            $itemRules = ['string', 'max:1024'];
            $itemRules = array_merge($itemRules, $this->optionInRules($field));
            $rules[$prefix.'.*'] = $itemRules;
        }

        if ($field->type->isMultipleRelationType() && $field->type !== FieldTypeEnum::ManyToMany) {
            $rules[$prefix.'.*'] = ['integer', $this->relatedItemExistsRule($field)];
        }

        if ($field->type === FieldTypeEnum::ManyToMany) {
            $rules[$prefix][] = $this->manyToManyArrayRule($field);
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

        if ($field->type === FieldTypeEnum::Blocks) {
            $rules[$prefix.'.*'] = ['array'];
            $rules[$prefix.'.*.id'] = ['required', 'uuid'];
            $rules[$prefix.'.*.type'] = ['required', 'string'];
            $rules[$prefix.'.*.data'] = ['required', 'array'];
            $rules[$prefix][] = function (string $attribute, mixed $value, \Closure $fail) use ($field): void {
                $this->validateBlocksPayload($field, $attribute, $value, $fail);
            };
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
                $prefix => [$presence, 'array', $this->mapGeometryRule()],
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
            FieldTypeEnum::Blocks => [
                $prefix => [
                    $presence,
                    'array',
                    function (string $attribute, mixed $value, \Closure $fail) use ($field): void {
                        $this->validateBlocksPayload($field, $attribute, $value, $fail);
                    },
                ],
                $prefix.'.*' => ['array'],
                $prefix.'.*.id' => ['required', 'uuid'],
                $prefix.'.*.type' => ['required', 'string'],
                $prefix.'.*.data' => ['required', 'array'],
            ],
            FieldTypeEnum::Relation,
            FieldTypeEnum::ManyToOne,
            FieldTypeEnum::RelationTree => [
                $prefix => [$presence, 'integer', $this->relatedItemExistsRule($field)],
            ],
            FieldTypeEnum::RelationMany,
            FieldTypeEnum::OneToMany,
            FieldTypeEnum::ManyToMany => [
                $prefix => [$presence, 'array', $this->manyToManyArrayRule($field)],
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
            FieldTypeEnum::Map => [$presence, 'array', $this->mapGeometryRule()],
            FieldTypeEnum::Image => $field->usesArrayStorage()
                ? [$presence, 'array']
                : [$presence, 'integer', Rule::exists('files', 'id')],
            FieldTypeEnum::File => [$presence, 'integer', Rule::exists('files', 'id')],
            FieldTypeEnum::Files => [$presence, 'array'],
            FieldTypeEnum::M2a => [$presence, 'array'],
            FieldTypeEnum::Blocks => [
                $presence,
                'array',
                function (string $attribute, mixed $value, \Closure $fail) use ($field): void {
                    $this->validateBlocksPayload($field, $attribute, $value, $fail);
                },
            ],
            FieldTypeEnum::Relation,
            FieldTypeEnum::ManyToOne,
            FieldTypeEnum::RelationTree => [$presence, 'integer', $this->relatedItemExistsRule($field)],
            FieldTypeEnum::RelationMany,
            FieldTypeEnum::OneToMany => [$presence, 'array'],
            FieldTypeEnum::ManyToMany => [$presence, 'array', $this->manyToManyArrayRule($field)],
        };
    }

    /**
     * Accept legacy `{ lat, lng }` or GeoJSON Point / MultiPoint.
     */
    private function mapGeometryRule(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail): void {
            if ($value === null || $value === '') {
                return;
            }

            if (! is_array($value)) {
                $fail('The '.$attribute.' must be a map geometry object.');

                return;
            }

            // Empty form submission (all blanks) — treat as null via normalizer.
            $isLegacyEmpty = (array_key_exists('lat', $value) || array_key_exists('lng', $value))
                && ($value['lat'] ?? '') === ''
                && ($value['lng'] ?? '') === '';
            $isGeoEmpty = isset($value['type'])
                && (! isset($value['coordinates']) || $value['coordinates'] === [] || $value['coordinates'] === null);

            if ($isLegacyEmpty || $isGeoEmpty) {
                return;
            }

            if (MapGeometry::normalize($value) === null) {
                $fail('The '.$attribute.' must be GeoJSON Point/MultiPoint or {lat,lng}.');
            }
        };
    }

    /**
     * Accept bare ints or `{ related_item_id, meta }` objects for M2M links.
     */
    private function manyToManyArrayRule(CollectionField $field): \Closure
    {
        $exists = $this->relatedItemExistsRule($field);

        return function (string $attribute, mixed $value, \Closure $fail) use ($exists): void {
            if (! is_array($value)) {
                $fail('The '.$attribute.' must be an array.');

                return;
            }

            foreach ($value as $index => $entry) {
                if (is_numeric($entry)) {
                    $validator = validator(['id' => (int) $entry], ['id' => ['integer', $exists]]);
                    if ($validator->fails()) {
                        $fail('The '.$attribute.'.'.$index.' is invalid.');
                    }

                    continue;
                }

                if (! is_array($entry) || ! isset($entry['related_item_id'])) {
                    $fail('The '.$attribute.'.'.$index.' must be an integer or {related_item_id, meta}.');

                    continue;
                }

                $validator = validator(
                    ['id' => $entry['related_item_id'], 'meta' => $entry['meta'] ?? []],
                    ['id' => ['integer', $exists], 'meta' => ['sometimes', 'array']],
                );
                if ($validator->fails()) {
                    $fail('The '.$attribute.'.'.$index.' is invalid.');
                }
            }
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
            FieldTypeEnum::Multiselect,
            FieldTypeEnum::CheckboxGroup,
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

    /**
     * @param  array<string, mixed>  $data
     */
    private function fieldIsEffectivelyRequired(CollectionField $field, array $data): bool
    {
        $flags = $this->conditionEvaluator->effectiveFlags($field, $data);

        if ($flags['hidden']) {
            return false;
        }

        return $flags['required'];
    }

    /**
     * Static required from settings / validation_rules only (ignores conditions).
     */
    private function fieldIsStaticallyRequired(CollectionField $field): bool
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

    /**
     * @param  array<string, mixed>  $data
     */
    private function presenceRule(CollectionField $field, bool $creating, array $data): mixed
    {
        if ($this->fieldIsStaticallyRequired($field)) {
            $flags = $this->conditionEvaluator->effectiveFlags($field, $data);
            if ($flags['hidden']) {
                return $creating ? 'nullable' : 'sometimes';
            }

            return 'required';
        }

        $conditions = data_get($field->settings, 'conditions');
        if (is_array($conditions) && array_key_exists('required', $conditions)) {
            return Rule::requiredIf(function () use ($field): bool {
                $payload = request()->input('data', []);
                if (! is_array($payload)) {
                    $payload = [];
                }

                $flags = $this->conditionEvaluator->effectiveFlags($field, $payload);

                return $flags['required'] && ! $flags['hidden'];
            });
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
        return $this->localeResolver->allowedLocales();
    }

    /**
     * Check if a value is non-empty for translatable field validation.
     */
    private function hasNonEmptyValue(mixed $value): bool
    {
        if ($value === null || $value === '' || $value === []) {
            return false;
        }

        if (is_array($value) && count($value) === 0) {
            return false;
        }

        if (is_string($value) && trim($value) === '') {
            return false;
        }

        return true;
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

    private function validateBlocksPayload(CollectionField $field, string $attribute, mixed $value, \Closure $fail): void
    {
        if (! is_array($value)) {
            return;
        }

        $types = $this->blocksFieldSchema->blockTypeMap($field);

        foreach ($value as $index => $block) {
            if (! is_array($block)) {
                continue;
            }

            $type = (string) ($block['type'] ?? '');
            $schema = $types[$type] ?? null;
            if (! is_array($schema)) {
                $fail(__(':attribute block type is invalid.', ['attribute' => $attribute.'.'.$index]));

                continue;
            }

            $blockData = is_array($block['data'] ?? null) ? $block['data'] : [];
            $nestedRules = [];

            foreach ($schema['fields'] as $definition) {
                $nestedField = $this->blocksFieldSchema->toFieldDefinition($definition);
                $flags = $this->conditionEvaluator->effectiveFlags($nestedField, $blockData);

                // Hidden-by-condition nested fields are not required (aligned with top-level).
                if ($flags['hidden']) {
                    continue;
                }

                $nestedPrefix = 'data.'.$nestedField->name;
                $required = $flags['required'];

                if ($nestedField->translatable) {
                    $nestedRules = array_merge(
                        $nestedRules,
                        $this->rulesForTranslatableLocaleMap($nestedField, $nestedPrefix)
                    );

                    continue;
                }

                $nestedRules[$nestedPrefix] = $this->nonTranslatableRules($nestedField, $required, null);
            }

            $validator = Validator::make(['data' => $blockData], $nestedRules);
            if ($validator->fails()) {
                foreach ($validator->errors()->all() as $message) {
                    $fail($message);
                }
            }
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function rulesForTranslatableLocaleMap(CollectionField $field, string $prefix): array
    {
        $allowedLocales = $this->allowedLocales();
        $rules = [
            $prefix => [
                'nullable',
                'array',
                function (string $attribute, mixed $value, \Closure $fail) use ($allowedLocales): void {
                    if (! is_array($value)) {
                        return;
                    }

                    foreach (array_keys($value) as $locale) {
                        if (! is_string($locale) || ! in_array($locale, $allowedLocales, true)) {
                            $fail(__('Locale :locale is not enabled.', ['locale' => (string) $locale]));
                        }
                    }
                },
            ],
        ];

        foreach ($allowedLocales as $locale) {
            $rules = array_merge(
                $rules,
                $this->rulesForTranslatableLocale($field, $prefix.'.'.$locale, false, null)
            );
        }

        return $rules;
    }
}

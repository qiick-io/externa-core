<?php

namespace App\Http\Requests\Collections\Concerns;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Collections\CollectionFieldGroupService;
use App\Services\Collections\FieldConditionEvaluator;
use App\Support\Collections\BlocksFieldSchema;
use App\Support\Collections\CollectionLocaleResolver;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Validator;

/**
 * Shared validation rules and normalization for collection field settings payloads.
 */
trait ValidatesCollectionFieldSettings
{
    /**
     * Build validation rules for field settings, including locale-specific keys.
     *
     * @return array<string, mixed>
     */
    protected function fieldSettingsRules(?FieldTypeEnum $fieldType = null): array
    {
        $localeList = app(CollectionLocaleResolver::class)->allowedLocales();
        if ($localeList === []) {
            $localeList = ['en'];
        }

        $rules = [
            'settings' => ['nullable', 'array'],
            'settings.display_name' => ['sometimes', 'array'],
            'settings.note' => ['sometimes', 'array'],
            'settings.validation_message' => ['sometimes', 'array'],
            'settings.required' => ['sometimes'],
            'settings.readonly' => ['sometimes'],
            'settings.hidden_in_form' => ['sometimes'],
            'settings.layout_width' => ['sometimes', Rule::in(['half', 'full', 'fill'])],
            'settings.layout_starts_new_row' => ['sometimes'],
            'settings.group' => ['sometimes', 'nullable', 'string', 'max:64', 'regex:/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/'],
            'settings.accordion_mode' => ['sometimes'],
            'settings.fill_width' => ['sometimes'],
            'settings.start' => ['sometimes', Rule::in(['closed', 'first', 'opened', 'open'])],
            'settings.default_value' => ['sometimes', 'nullable'],
            'settings.validation_rules' => ['sometimes', 'array'],
            'settings.validation_rules.*.operator' => [
                'required_with:settings.validation_rules',
                Rule::in([
                    'required',
                    'unique',
                    'min_length',
                    'max_length',
                    'min',
                    'max',
                    'regex',
                    'contains',
                    'not_contains',
                    'equals',
                    'not_equals',
                ]),
            ],
            'settings.validation_rules.*.value' => ['nullable'],
            // Tree options (checkbox_group_tree) nest `children`; keep as opaque array and
            // sanitize in normalizeSettingsArray so validated() does not strip descendants.
            'settings.options' => ['sometimes', 'array'],
            'settings.related_collection_id' => ['sometimes', 'nullable', 'integer', 'exists:collections,id'],
            'settings.display_field' => ['sometimes', 'string', 'max:64'],
            'settings.display_template' => ['sometimes', 'nullable', 'string', 'max:255'],
            'settings.filter' => ['sometimes', 'nullable'],
            'settings.junction_fields' => ['sometimes', 'nullable', 'array'],
            'settings.junction_fields.*.name' => ['required_with:settings.junction_fields', 'string', 'max:64', 'regex:/^[a-z][a-z0-9_]*$/'],
            'settings.junction_fields.*.type' => ['required_with:settings.junction_fields', Rule::in(['string', 'number', 'boolean'])],
            'settings.allowed_collection_ids' => ['sometimes', 'array'],
            'settings.allowed_collection_ids.*' => ['integer', 'exists:collections,id'],
            'settings.max_blocks_depth' => [
                'sometimes',
                'integer',
                'min:1',
                'max:'.BlocksFieldSchema::MAX_BLOCKS_DEPTH,
            ],
            'settings.block_types' => ['sometimes', 'array'],
            'settings.block_types.*.key' => ['required_with:settings.block_types', 'string', 'max:64', 'regex:/^[a-z][a-z0-9_]*$/'],
            'settings.block_types.*.label' => ['required_with:settings.block_types', 'string', 'max:255'],
            'settings.block_types.*.fields' => ['sometimes', 'array'],
            'settings.block_types.*.fields.*.name' => ['required_with:settings.block_types.*.fields', 'string', 'max:64', 'regex:/^[a-z][a-z0-9_]*$/'],
            'settings.block_types.*.fields.*.type' => ['required_with:settings.block_types.*.fields', Rule::in(BlocksFieldSchema::ALLOWED_NESTED_TYPES)],
            'settings.block_types.*.fields.*.translatable' => ['sometimes', 'boolean'],
            'settings.block_types.*.fields.*.settings' => ['sometimes', 'array'],
            'settings.allow_multiple' => ['sometimes'],
            'settings.allow_none' => ['sometimes'],
            'settings.allow_other' => ['sometimes'],
            'settings.allow_duplicates' => ['sometimes'],
            'settings.input_type' => ['sometimes', 'string', 'max:32'],
            'settings.placeholder' => ['sometimes', 'array'],
            'settings.icon_left' => ['sometimes', 'nullable', 'string', 'max:64'],
            'settings.icon_right' => ['sometimes', 'nullable', 'string', 'max:64'],
            'settings.url' => $fieldType === FieldTypeEnum::ApiAutocomplete
                ? ['required', 'string', 'max:2048']
                : ['sometimes', 'nullable', 'string', 'max:2048'],
            'settings.results_path' => ['sometimes', 'nullable', 'string', 'max:255'],
            'settings.text_path' => ['sometimes', 'nullable', 'string', 'max:255'],
            'settings.value_path' => ['sometimes', 'nullable', 'string', 'max:255'],
            'settings.trigger' => ['sometimes', Rule::in(['throttle', 'debounce'])],
            'settings.rate' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'settings.max_length' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'settings.trim' => ['sometimes'],
            'settings.slugify' => ['sometimes'],
            'settings.masked' => ['sometimes'],
            'settings.min' => ['sometimes', 'nullable', 'numeric'],
            'settings.max' => ['sometimes', 'nullable', 'numeric'],
            'settings.step' => ['sometimes', 'nullable', 'numeric'],
            'settings.rows' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'settings.language' => ['sometimes', 'string', 'max:64'],
            'settings.line_numbers' => ['sometimes'],
            'settings.line_wrapping' => ['sometimes'],
            'settings.template' => ['sometimes', 'nullable', 'string', 'max:65535'],
            'settings.presets' => ['sometimes'],
            'settings.separator' => ['sometimes', 'string', 'max:8'],
            'settings.lowercase' => ['sometimes'],
            'settings.alphabetize' => ['sometimes'],
            'settings.label_on' => ['sometimes', 'array'],
            'settings.label_off' => ['sometimes', 'array'],
            'settings.include_seconds' => ['sometimes'],
            'settings.date_mode' => ['sometimes', Rule::in(['date', 'time', 'datetime'])],
            'settings.default_lat' => ['sometimes', 'nullable', 'numeric'],
            'settings.default_lng' => ['sometimes', 'nullable', 'numeric'],
            'settings.default_zoom' => ['sometimes', 'nullable', 'integer'],
            'settings.geometry_mode' => ['sometimes', 'nullable', Rule::in(['point', 'multipoint'])],
            'settings.opacity' => ['sometimes'],
            'settings.preset_colors' => ['sometimes'],
            'settings.allowed_mime_types' => ['sometimes'],
            'settings.crop_to_fit' => ['sometimes'],
            'settings.layout' => ['sometimes', Rule::in(['list', 'table'])],
            'settings.value_combining' => ['sometimes', Rule::in(['all', 'leaf'])],
            'settings.show_value' => ['sometimes'],
            'settings.items_shown' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'settings.conditions' => ['sometimes', 'nullable', 'array'],
            'settings.conditions.logic' => ['sometimes', Rule::in(['and'])],
            'settings.conditions.rules' => ['sometimes', 'array'],
            'settings.conditions.rules.*.field' => ['required_with:settings.conditions.rules', 'string', 'max:64'],
            'settings.conditions.rules.*.operator' => [
                'required_with:settings.conditions.rules',
                Rule::in(['equals', 'not_equals', 'empty', 'not_empty']),
            ],
            'settings.conditions.rules.*.value' => ['nullable'],
            'settings.conditions.hidden' => ['sometimes'],
            'settings.conditions.readonly' => ['sometimes'],
            'settings.conditions.required' => ['sometimes'],
        ];

        foreach ($localeList as $locale) {
            if (! is_string($locale)) {
                continue;
            }

            // nullable: ConvertEmptyStringsToNull turns blank locale inputs into null
            $rules['settings.display_name.'.$locale] = ['sometimes', 'nullable', 'string', 'max:255'];
            $rules['settings.note.'.$locale] = ['sometimes', 'nullable', 'string', 'max:1024'];
            $rules['settings.validation_message.'.$locale] = ['sometimes', 'nullable', 'string', 'max:1024'];
            $rules['settings.placeholder.'.$locale] = ['sometimes', 'nullable', 'string', 'max:255'];
            $rules['settings.label_on.'.$locale] = ['sometimes', 'nullable', 'string', 'max:255'];
            $rules['settings.label_off.'.$locale] = ['sometimes', 'nullable', 'string', 'max:255'];
        }

        return $rules;
    }

    /**
     * After base rules pass: force group width + validate nesting parent.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            $type = $this->resolveFieldTypeForTranslatable();
            $settings = $this->input('settings');
            if (! is_array($settings)) {
                $settings = null;
            }

            $groupService = app(CollectionFieldGroupService::class);

            if ($type !== null && is_array($settings)) {
                $settings = $groupService->forceFullWidthForGroup($type, $settings);
                $this->merge(['settings' => $settings]);
            }

            $collection = $this->route('collection');
            if (! $collection instanceof Collection) {
                return;
            }

            $field = $this->route('field');
            $fieldModel = $field instanceof CollectionField ? $field : null;

            try {
                $groupService->assertValidGroupParent(
                    $collection,
                    is_array($this->input('settings')) ? $this->input('settings') : null,
                    $fieldModel,
                    $type,
                );
            } catch (ValidationException $e) {
                foreach ($e->errors() as $key => $messages) {
                    foreach ($messages as $message) {
                        $validator->errors()->add($key, $message);
                    }
                }
            }
        });
    }

    /**
     * Decode string filter values and drop empty filters before validation.
     *
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>
     */
    protected function normalizeSettingsArray(array $settings): array
    {
        $settings = app(BlocksFieldSchema::class)->normalizeSettings($settings);
        $settings = $this->pruneEmptyTranslatedSettings($settings);

        if (array_key_exists('options', $settings)) {
            $normalizedOptions = $this->normalizeOptionsTree($settings['options']);
            if ($normalizedOptions === []) {
                unset($settings['options']);
            } else {
                $settings['options'] = $normalizedOptions;
            }
        }

        if (array_key_exists('group', $settings)) {
            $group = $settings['group'];
            if (! is_string($group) || trim($group) === '') {
                unset($settings['group']);
            } else {
                $settings['group'] = trim($group);
            }
        }

        if (array_key_exists('accordion_mode', $settings)) {
            $settings['accordion_mode'] = CollectionField::settingsFlagIsEnabled($settings['accordion_mode']);
        }

        if (array_key_exists('fill_width', $settings)) {
            $settings['fill_width'] = CollectionField::settingsFlagIsEnabled($settings['fill_width']);
        }

        if (isset($settings['start']) && is_string($settings['start'])) {
            $start = $settings['start'];
            // Detail uses open|closed; accordion uses closed|first|opened — accept both.
            if (! in_array($start, ['closed', 'first', 'opened', 'open'], true)) {
                unset($settings['start']);
            }
        }

        // Directus: "all open" is only valid when accordion mode is off.
        $accordionMode = array_key_exists('accordion_mode', $settings)
            ? CollectionField::settingsFlagIsEnabled($settings['accordion_mode'])
            : null;
        if ($accordionMode === true && ($settings['start'] ?? null) === 'opened') {
            $settings['start'] = 'closed';
        }

        if (isset($settings['filter']) && is_string($settings['filter'])) {
            $trimmed = trim($settings['filter']);
            if ($trimmed === '') {
                unset($settings['filter']);
            } else {
                /** @var array<string, mixed>|null $decoded */
                $decoded = json_decode($trimmed, true);
                if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                    $settings['filter'] = $decoded;
                }
            }
        }

        if (array_key_exists('junction_fields', $settings)) {
            $rawJunction = $settings['junction_fields'];
            if (is_string($rawJunction)) {
                $trimmed = trim($rawJunction);
                if ($trimmed === '') {
                    unset($settings['junction_fields']);
                    $rawJunction = null;
                } else {
                    $decoded = json_decode($trimmed, true);
                    $rawJunction = json_last_error() === JSON_ERROR_NONE ? $decoded : null;
                }
            }

            if ($rawJunction === null) {
                unset($settings['junction_fields']);
            } elseif (is_array($rawJunction)) {
                $normalizedJunction = [];
                $seenNames = [];
                foreach ($rawJunction as $entry) {
                    if (! is_array($entry)) {
                        continue;
                    }
                    $name = (string) ($entry['name'] ?? '');
                    if ($name === '' || isset($seenNames[$name])) {
                        continue;
                    }
                    $seenNames[$name] = true;
                    $type = (string) ($entry['type'] ?? 'string');
                    if (! in_array($type, ['string', 'number', 'boolean'], true)) {
                        $type = 'string';
                    }
                    $normalizedJunction[] = [
                        'name' => $name,
                        'type' => $type,
                    ];
                }

                if ($normalizedJunction === []) {
                    unset($settings['junction_fields']);
                } else {
                    $settings['junction_fields'] = $normalizedJunction;
                }
            } else {
                unset($settings['junction_fields']);
            }
        }

        if (array_key_exists('conditions', $settings)) {
            $normalizedConditions = app(FieldConditionEvaluator::class)
                ->normalizeSettings(is_array($settings['conditions']) ? $settings['conditions'] : null);

            if ($normalizedConditions === null) {
                unset($settings['conditions']);
            } else {
                $settings['conditions'] = $normalizedConditions;
            }
        }

        // Drop dead use_24h — native date inputs don't honor AM/PM; use date_mode instead.
        unset($settings['use_24h']);

        if (isset($settings['block_types']) && is_array($settings['block_types'])) {
            $seenBlockKeys = [];
            $normalizedBlockTypes = [];

            foreach ($settings['block_types'] as $blockType) {
                if (! is_array($blockType)) {
                    continue;
                }

                $key = (string) ($blockType['key'] ?? '');
                if ($key === '' || isset($seenBlockKeys[$key])) {
                    continue;
                }

                $seenBlockKeys[$key] = true;

                $seenFieldNames = [];
                $normalizedFields = [];
                foreach (is_array($blockType['fields'] ?? null) ? $blockType['fields'] : [] as $field) {
                    if (! is_array($field)) {
                        continue;
                    }

                    $name = (string) ($field['name'] ?? '');
                    if ($name === '' || isset($seenFieldNames[$name])) {
                        continue;
                    }

                    $seenFieldNames[$name] = true;
                    $normalizedFields[] = $field;
                }

                $blockType['fields'] = $normalizedFields;
                $normalizedBlockTypes[] = $blockType;
            }

            $settings['block_types'] = $normalizedBlockTypes;
        }

        return $settings;
    }

    /**
     * Keep value/label/children trees for select-like + checkbox_group_tree options.
     *
     * @return list<array{value: string, label: string, children?: list<array<string, mixed>>}>
     */
    protected function normalizeOptionsTree(mixed $options): array
    {
        if (! is_array($options)) {
            return [];
        }

        $normalized = [];
        foreach ($options as $option) {
            if (! is_array($option)) {
                continue;
            }

            $value = isset($option['value']) ? trim((string) $option['value']) : '';
            $label = isset($option['label']) ? trim((string) $option['label']) : '';
            if ($value === '' && $label === '') {
                continue;
            }

            $row = [
                'value' => $value !== '' ? mb_substr($value, 0, 255) : $label,
                'label' => $label !== '' ? mb_substr($label, 0, 255) : $value,
            ];

            if (array_key_exists('children', $option)) {
                $children = $this->normalizeOptionsTree($option['children']);
                if ($children !== []) {
                    $row['children'] = $children;
                }
            }

            $normalized[] = $row;
        }

        return $normalized;
    }

    /**
     * Drop blank/null translated locale values (empty inputs become null via ConvertEmptyStringsToNull).
     *
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>
     */
    protected function pruneEmptyTranslatedSettings(array $settings): array
    {
        foreach (['display_name', 'note', 'validation_message', 'placeholder', 'label_on', 'label_off'] as $key) {
            if (! isset($settings[$key]) || ! is_array($settings[$key])) {
                continue;
            }

            $cleaned = [];
            foreach ($settings[$key] as $locale => $value) {
                if (is_string($value) && trim($value) !== '') {
                    $cleaned[$locale] = $value;
                }
            }

            if ($cleaned === []) {
                unset($settings[$key]);
            } else {
                $settings[$key] = $cleaned;
            }
        }

        return $settings;
    }

    /**
     * Force translatable=false for hash / relation types (UI hides the toggle).
     */
    protected function coerceDisallowedTranslatable(): void
    {
        $type = $this->resolveFieldTypeForTranslatable();

        if ($type !== null && ! $type->supportsTranslatable()) {
            $this->merge(['translatable' => false]);
        }
    }

    protected function resolveFieldTypeForTranslatable(): ?FieldTypeEnum
    {
        $raw = $this->input('type');

        if (is_string($raw) && $raw !== '') {
            return FieldTypeEnum::tryFrom($raw);
        }

        if ($raw instanceof FieldTypeEnum) {
            return $raw;
        }

        $field = $this->route('field');

        if ($field instanceof CollectionField) {
            return $field->type instanceof FieldTypeEnum ? $field->type : null;
        }

        return null;
    }
}

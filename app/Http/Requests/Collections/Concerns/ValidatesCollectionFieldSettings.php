<?php

namespace App\Http\Requests\Collections\Concerns;

use App\Enums\FieldTypeEnum;
use App\Support\Collections\CollectionLocaleResolver;
use Illuminate\Validation\Rule;

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
            'settings.options' => ['sometimes', 'array'],
            'settings.options.*.value' => ['sometimes', 'string', 'max:255'],
            'settings.options.*.label' => ['sometimes', 'string', 'max:255'],
            'settings.related_collection_id' => ['sometimes', 'nullable', 'integer', 'exists:collections,id'],
            'settings.display_field' => ['sometimes', 'string', 'max:64'],
            'settings.display_template' => ['sometimes', 'nullable', 'string', 'max:255'],
            'settings.filter' => ['sometimes', 'nullable'],
            'settings.allowed_collection_ids' => ['sometimes', 'array'],
            'settings.allowed_collection_ids.*' => ['integer', 'exists:collections,id'],
            'settings.allow_multiple' => ['sometimes'],
            'settings.allow_none' => ['sometimes'],
            'settings.allow_other' => ['sometimes'],
            'settings.allow_duplicates' => ['sometimes'],
            'settings.input_type' => ['sometimes', 'string', 'max:32'],
            'settings.placeholder' => ['sometimes', 'array'],
            'settings.icon_left' => ['sometimes', 'nullable', 'string', 'max:64'],
            'settings.icon_right' => ['sometimes', 'nullable', 'string', 'max:64'],
            'settings.url' => ['sometimes', 'nullable', 'string', 'max:2048'],
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
            'settings.use_24h' => ['sometimes'],
            'settings.default_lat' => ['sometimes', 'nullable', 'numeric'],
            'settings.default_lng' => ['sometimes', 'nullable', 'numeric'],
            'settings.default_zoom' => ['sometimes', 'nullable', 'integer'],
            'settings.opacity' => ['sometimes'],
            'settings.preset_colors' => ['sometimes'],
            'settings.allowed_mime_types' => ['sometimes'],
            'settings.crop_to_fit' => ['sometimes'],
            'settings.layout' => ['sometimes', Rule::in(['list', 'table'])],
            'settings.value_combining' => ['sometimes', Rule::in(['all', 'leaf'])],
            'settings.show_value' => ['sometimes'],
            'settings.items_shown' => ['sometimes', 'nullable', 'integer', 'min:1'],
        ];

        foreach ($localeList as $locale) {
            if (! is_string($locale)) {
                continue;
            }

            $rules['settings.display_name.'.$locale] = ['sometimes', 'string', 'max:255'];
            $rules['settings.note.'.$locale] = ['sometimes', 'string', 'max:1024'];
            $rules['settings.validation_message.'.$locale] = ['sometimes', 'string', 'max:1024'];
            $rules['settings.placeholder.'.$locale] = ['sometimes', 'string', 'max:255'];
            $rules['settings.label_on.'.$locale] = ['sometimes', 'string', 'max:255'];
            $rules['settings.label_off.'.$locale] = ['sometimes', 'string', 'max:255'];
        }

        return $rules;
    }

    /**
     * Decode string filter values and drop empty filters before validation.
     *
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>
     */
    protected function normalizeSettingsArray(array $settings): array
    {
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

        return $settings;
    }
}

<?php

namespace App\Services\Cms;

use App\Enums\FieldType;
use App\Models\ContentCollection;
use App\Models\Field;
use Illuminate\Contracts\Validation\ValidationRule;

class ItemDataRuleBuilder
{
    /**
     * @return array<string, mixed>
     */
    public function rules(ContentCollection $collection, bool $creating): array
    {
        $collection->loadMissing('fields');

        $rules = [
            'data' => $creating ? ['required', 'array'] : ['sometimes', 'array'],
        ];

        foreach ($collection->fields as $field) {
            $rules = array_merge($rules, $this->rulesForField($field, $creating));
        }

        return $rules;
    }

    /**
     * @return array<string, mixed>
     */
    private function rulesForField(Field $field, bool $creating): array
    {
        $prefix = 'data.'.$field->name;
        $required = $creating ? 'required' : 'sometimes';

        if ($field->translatable) {
            $rules = [
                $prefix => [$required, 'array'],
            ];
            foreach ($this->allowedLocales() as $locale) {
                $rules = array_merge(
                    $rules,
                    $this->rulesForTranslatableLocale($field, $prefix.'.'.$locale)
                );
            }

            return $rules;
        }

        $rules = [
            $prefix => array_merge([$required], $this->nonTranslatableRules($field)),
        ];

        if (in_array($field->type, [FieldType::Tag, FieldType::Multiselect], true)) {
            $rules[$prefix.'.*'] = ['string', 'max:1024'];
        }

        return $rules;
    }

    /**
     * @return array<string, mixed>
     */
    private function rulesForTranslatableLocale(Field $field, string $prefix): array
    {
        return match ($field->type) {
            FieldType::Tag,
            FieldType::Multiselect => [
                $prefix => ['nullable', 'array'],
                $prefix.'.*' => ['string', 'max:1024'],
            ],
            FieldType::Number => [
                $prefix => ['nullable', 'numeric'],
            ],
            FieldType::Boolean => [
                $prefix => ['nullable', 'boolean'],
            ],
            FieldType::String,
            FieldType::Textarea,
            FieldType::Markdown,
            FieldType::Code,
            FieldType::Select,
            FieldType::RadioGroup,
            FieldType::Date,
            FieldType::Color => [
                $prefix => ['nullable', 'string', 'max:65535'],
            ],
        };
    }

    /**
     * @return list<string|ValidationRule>
     */
    private function nonTranslatableRules(Field $field): array
    {
        return match ($field->type) {
            FieldType::String,
            FieldType::Textarea,
            FieldType::Markdown,
            FieldType::Code,
            FieldType::Select,
            FieldType::RadioGroup,
            FieldType::Date,
            FieldType::Color => ['string', 'max:65535'],
            FieldType::Number => ['numeric'],
            FieldType::Boolean => ['boolean'],
            FieldType::Multiselect,
            FieldType::Tag => ['array'],
        };
    }

    /**
     * @return list<string>
     */
    private function allowedLocales(): array
    {
        $locales = config('cms.locales', ['en']);

        return is_array($locales) ? array_values(array_filter($locales, fn ($l) => is_string($l))) : ['en'];
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function assertKnownKeysOnly(ContentCollection $collection, array $data): void
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

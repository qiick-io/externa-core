<?php

namespace App\Services\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

class CollectionItemDataRuleBuilder
{
    /**
     * @return array<string, mixed>
     */
    public function rules(Collection $collection, bool $creating): array
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
    private function rulesForField(CollectionField $field, bool $creating): array
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

        if (in_array($field->type, [FieldTypeEnum::Tag, FieldTypeEnum::Multiselect, FieldTypeEnum::RelationMany], true)) {
            $rules[$prefix.'.*'] = $field->type === FieldTypeEnum::RelationMany
                ? ['integer']
                : ['string', 'max:1024'];
        }

        return $rules;
    }

    /**
     * @return array<string, mixed>
     */
    private function rulesForTranslatableLocale(CollectionField $field, string $prefix): array
    {
        return match ($field->type) {
            FieldTypeEnum::Tag,
            FieldTypeEnum::Multiselect => [
                $prefix => ['nullable', 'array'],
                $prefix.'.*' => ['string', 'max:1024'],
            ],
            FieldTypeEnum::Number => [
                $prefix => ['nullable', 'numeric'],
            ],
            FieldTypeEnum::Boolean => [
                $prefix => ['nullable', 'boolean'],
            ],
            FieldTypeEnum::String,
            FieldTypeEnum::Textarea,
            FieldTypeEnum::Markdown,
            FieldTypeEnum::Code,
            FieldTypeEnum::Select,
            FieldTypeEnum::RadioGroup,
            FieldTypeEnum::Date,
            FieldTypeEnum::Color => [
                $prefix => ['nullable', 'string', 'max:65535'],
            ],
            FieldTypeEnum::Image,
            FieldTypeEnum::File => [
                $prefix => ['nullable', 'integer', Rule::exists('files', 'id')],
            ],
            FieldTypeEnum::Relation => [
                $prefix => ['nullable', 'integer', $this->relatedItemExistsRule($field)],
            ],
            FieldTypeEnum::RelationMany => [
                $prefix => ['nullable', 'array'],
                $prefix.'.*' => ['integer', $this->relatedItemExistsRule($field)],
            ],
        };
    }

    /**
     * @return list<string|ValidationRule>
     */
    private function nonTranslatableRules(CollectionField $field): array
    {
        return match ($field->type) {
            FieldTypeEnum::String,
            FieldTypeEnum::Textarea,
            FieldTypeEnum::Markdown,
            FieldTypeEnum::Code,
            FieldTypeEnum::Select,
            FieldTypeEnum::RadioGroup,
            FieldTypeEnum::Date,
            FieldTypeEnum::Color => ['string', 'max:65535'],
            FieldTypeEnum::Number => ['numeric'],
            FieldTypeEnum::Boolean => ['boolean'],
            FieldTypeEnum::Multiselect,
            FieldTypeEnum::Tag => ['array'],
            FieldTypeEnum::Image,
            FieldTypeEnum::File => ['nullable', 'integer', Rule::exists('files', 'id')],
            FieldTypeEnum::Relation => ['nullable', 'integer', $this->relatedItemExistsRule($field)],
            FieldTypeEnum::RelationMany => ['array'],
        };
    }

    /**
     * @return Exists
     */
    private function relatedItemExistsRule(CollectionField $field): Rule
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

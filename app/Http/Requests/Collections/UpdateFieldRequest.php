<?php

namespace App\Http\Requests\Collections;

use App\Enums\FieldTypeEnum;
use App\Http\Requests\Collections\Concerns\ValidatesCollectionFieldSettings;
use App\Models\Collection;
use App\Models\CollectionField;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Validates updating a collection field definition.
 */
class UpdateFieldRequest extends FormRequest
{
    use ValidatesCollectionFieldSettings;

    /**
     * Authorization is enforced by collection route middleware.
     */
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->coerceDisallowedTranslatable();

        if (! $this->has('settings')) {
            return;
        }

        $raw = $this->input('settings');
        if ($raw === null || $raw === '') {
            $this->merge(['settings' => null]);

            return;
        }

        if (is_array($raw)) {
            $this->merge(['settings' => $this->normalizeSettingsArray($raw)]);

            return;
        }

        if (! is_string($raw)) {
            $this->merge(['settings' => null]);

            return;
        }

        /** @var array<string, mixed>|null $decoded */
        $decoded = json_decode($raw, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw ValidationException::withMessages([
                'settings' => __('Invalid JSON in settings.'),
            ]);
        }

        $this->merge(['settings' => is_array($decoded) ? $decoded : null]);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var Collection $collection */
        $collection = $this->route('collection');
        /** @var CollectionField $field */
        $field = $this->route('field');

        return [
            'name' => [
                'sometimes',
                'string',
                'max:64',
                'regex:/^[a-z][a-z0-9_]*$/',
                Rule::unique('collections_fields', 'name')
                    ->where(fn ($q) => $q->where('collection_id', $collection->id))
                    ->ignore($field->id),
            ],
            'type' => ['sometimes', Rule::enum(FieldTypeEnum::class)],
            'translatable' => ['sometimes', 'boolean'],
            ...$this->fieldSettingsRules($field->type),
        ];
    }
}

<?php

namespace App\Http\Requests\Collections;

use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Http\Requests\Collections\Concerns\ValidatesCollectionFieldSettings;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use App\Models\Collection;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Validates creating a collection field definition.
 */
class StoreFieldRequest extends FormRequest
{
    use AuthorizesWithPermission;
    use ValidatesCollectionFieldSettings;

    /**
     * Authorization is enforced by collection route middleware.
     */
    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanEditCollections->value);

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

        $this->merge([
            'settings' => is_array($decoded) ? $this->normalizeSettingsArray($decoded) : null,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var Collection $collection */
        $collection = $this->route('collection');

        return [
            'name' => [
                'required',
                'string',
                'max:64',
                // Str::slug style (a-z0-9 + hyphens); underscores kept for legacy field keys.
                'regex:/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/',
                Rule::unique('collections_fields', 'name')->where(fn ($q) => $q->where('collection_id', $collection->id)),
            ],
            'type' => ['required', Rule::enum(FieldTypeEnum::class)],
            'translatable' => ['sometimes', 'boolean'],
            ...$this->fieldSettingsRules(
                FieldTypeEnum::tryFrom((string) $this->input('type')),
            ),
        ];
    }
}

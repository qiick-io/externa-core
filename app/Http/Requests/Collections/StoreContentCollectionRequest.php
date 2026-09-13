<?php

namespace App\Http\Requests\Collections;

use App\Enums\CollectionStatusEnum;
use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Validates creating a content collection definition.
 */
class StoreContentCollectionRequest extends FormRequest
{
    use AuthorizesWithPermission;

    /**
     * Authorization is enforced by collection route middleware.
     */
    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanCreateCollections->value);

        return true;
    }

    /**
     * Validate collection name, slug, singleton flag, and presentation metadata.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'slug' => [
                'required',
                'string',
                'max:255',
                // Str::slug style (a-z0-9 + hyphens), same shape as field keys without legacy underscores.
                'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
                Rule::unique('collections', 'slug'),
            ],
            'description' => ['nullable', 'string', 'max:5000'],
            'status' => ['sometimes', 'string', Rule::in(CollectionStatusEnum::values())],
            'icon' => ['nullable', 'string', 'max:64'],
            'color' => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'is_singleton' => ['sometimes', 'boolean'],
            'versioning' => ['sometimes', 'boolean'],
            'revision_retention_count' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'revision_retention_days' => ['nullable', 'integer', 'min:1', 'max:3650'],
        ];
    }

    /**
     * Derive a slug from the collection name when one is not provided; normalize when present.
     */
    protected function prepareForValidation(): void
    {
        if (! $this->filled('slug')) {
            $this->merge(['slug' => Str::slug((string) $this->input('name', ''))]);
        } else {
            $this->merge(['slug' => Str::slug((string) $this->input('slug'))]);
        }

        if ($this->input('icon') === '') {
            $this->merge(['icon' => null]);
        }

        if ($this->input('color') === '') {
            $this->merge(['color' => null]);
        }

        if ($this->input('description') === '') {
            $this->merge(['description' => null]);
        }

        if (! $this->filled('revision_retention_count')) {
            $this->merge(['revision_retention_count' => null]);
        }

        if (! $this->filled('revision_retention_days')) {
            $this->merge(['revision_retention_days' => null]);
        }
    }

    /**
     * Coerce the singleton flag and default status.
     */
    protected function passedValidation(): void
    {
        $this->merge([
            'is_singleton' => $this->boolean('is_singleton'),
            'versioning' => $this->boolean('versioning'),
            'status' => $this->input('status', CollectionStatusEnum::Active->value),
        ]);
    }
}

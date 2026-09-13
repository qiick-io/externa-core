<?php

namespace App\Http\Requests\Collections;

use App\Enums\CollectionStatusEnum;
use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use App\Models\Collection;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Validates updating a content collection definition.
 */
class UpdateContentCollectionRequest extends FormRequest
{
    use AuthorizesWithPermission;

    /**
     * Authorization is enforced by collection route middleware.
     */
    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanEditCollections->value);

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var Collection $collection */
        $collection = $this->route('collection');

        return [
            'name' => ['sometimes', 'string', 'max:255'],
            'slug' => [
                'sometimes',
                'required',
                'string',
                'max:255',
                // Str::slug style (a-z0-9 + hyphens), same shape as field keys without legacy underscores.
                'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
                Rule::unique('collections', 'slug')->ignore($collection->id),
            ],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'status' => ['sometimes', 'string', Rule::in(CollectionStatusEnum::values())],
            'icon' => ['sometimes', 'nullable', 'string', 'max:64'],
            'color' => ['sometimes', 'nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'versioning' => ['sometimes', 'boolean'],
            'revision_retention_count' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:10000'],
            'revision_retention_days' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:3650'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->filled('slug')) {
            $this->merge(['slug' => Str::slug((string) $this->input('slug'))]);
        } elseif ($this->exists('slug') && ! $this->filled('slug') && $this->filled('name')) {
            $this->merge(['slug' => Str::slug((string) $this->input('name'))]);
        }

        if ($this->has('icon') && $this->input('icon') === '') {
            $this->merge(['icon' => null]);
        }

        if ($this->has('color') && $this->input('color') === '') {
            $this->merge(['color' => null]);
        }

        if ($this->has('description') && $this->input('description') === '') {
            $this->merge(['description' => null]);
        }

        if ($this->has('revision_retention_count') && ! $this->filled('revision_retention_count')) {
            $this->merge(['revision_retention_count' => null]);
        }

        if ($this->has('revision_retention_days') && ! $this->filled('revision_retention_days')) {
            $this->merge(['revision_retention_days' => null]);
        }
    }

    protected function passedValidation(): void
    {
        /** @var Collection $collection */
        $collection = $this->route('collection');

        if ($this->has('is_singleton') && $this->boolean('is_singleton') !== $collection->is_singleton) {
            throw ValidationException::withMessages([
                'is_singleton' => __('The singleton setting cannot be changed after the collection is created.'),
            ]);
        }

        if ($this->has('versioning')) {
            $this->merge(['versioning' => $this->boolean('versioning')]);
        }
    }
}

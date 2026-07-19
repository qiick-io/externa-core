<?php

namespace App\Http\Requests\Collections;

use App\Support\Collections\UniqueCollectionSlugGenerator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

/**
 * Validates creating a content collection definition.
 */
class StoreContentCollectionRequest extends FormRequest
{
    /**
     * Authorization is enforced by collection route middleware.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Validate collection name, slug, and singleton flag.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'is_singleton' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * Derive a slug from the collection name when one is not provided.
     */
    protected function prepareForValidation(): void
    {
        if (! $this->filled('slug')) {
            $this->merge(['slug' => Str::slug((string) $this->input('name', ''))]);
        }
    }

    /**
     * Normalize the slug to a unique value and coerce the singleton flag.
     */
    protected function passedValidation(): void
    {
        $this->merge([
            'slug' => app(UniqueCollectionSlugGenerator::class)->make((string) $this->input('slug', ''), null),
            'is_singleton' => $this->boolean('is_singleton'),
        ]);
    }
}

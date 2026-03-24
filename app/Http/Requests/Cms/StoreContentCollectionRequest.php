<?php

namespace App\Http\Requests\Cms;

use App\Support\Cms\UniqueCollectionSlug;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

class StoreContentCollectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
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

    protected function prepareForValidation(): void
    {
        if (! $this->filled('slug')) {
            $this->merge(['slug' => Str::slug((string) $this->input('name', ''))]);
        }
    }

    protected function passedValidation(): void
    {
        $this->merge([
            'slug' => app(UniqueCollectionSlug::class)->make((string) $this->input('slug', ''), null),
            'is_singleton' => $this->boolean('is_singleton'),
        ]);
    }
}

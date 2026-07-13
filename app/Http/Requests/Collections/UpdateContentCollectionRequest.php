<?php

namespace App\Http\Requests\Collections;

use App\Models\Collection;
use App\Support\Collections\UniqueCollectionSlug;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class UpdateContentCollectionRequest extends FormRequest
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
            'name' => ['sometimes', 'string', 'max:255'],
            'slug' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
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

        if (! $this->has('name') && ! $this->has('slug')) {
            return;
        }

        $slugInput = $this->input('slug');
        if ($slugInput === null || $slugInput === '') {
            $base = Str::slug((string) ($this->input('name') ?? $collection->name));
        } else {
            $base = (string) $slugInput;
        }

        $this->merge([
            'slug' => app(UniqueCollectionSlug::class)->make($base, $collection->id),
        ]);
    }
}

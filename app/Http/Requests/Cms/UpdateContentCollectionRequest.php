<?php

namespace App\Http\Requests\Cms;

use App\Models\ContentCollection;
use App\Support\Cms\UniqueCollectionSlug;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

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
            'is_singleton' => ['sometimes', 'boolean'],
        ];
    }

    protected function passedValidation(): void
    {
        /** @var ContentCollection $collection */
        $collection = $this->route('collection');

        if ($this->has('is_singleton')) {
            $this->merge(['is_singleton' => $this->boolean('is_singleton')]);
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

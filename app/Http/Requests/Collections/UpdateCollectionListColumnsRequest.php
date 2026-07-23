<?php

namespace App\Http\Requests\Collections;

use App\Models\Collection;
use App\Services\Collections\CollectionListColumnsNormalizer;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates user-scoped collection list column preferences.
 */
class UpdateCollectionListColumnsRequest extends FormRequest
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
            'columns' => ['required', 'array'],
            'columns.*' => ['string', 'max:128'],
            'aligns' => ['sometimes', 'array'],
            'aligns.*' => ['nullable', 'string', 'max:16'],
        ];
    }

    protected function passedValidation(): void
    {
        /** @var Collection $collection */
        $collection = $this->route('collection');

        $normalized = app(CollectionListColumnsNormalizer::class)
            ->normalize($this->input('columns'), $collection);

        $allowed = array_flip($normalized);
        $aligns = [];
        foreach ($this->input('aligns', []) as $path => $align) {
            if (! is_string($path) || ! isset($allowed[$path])) {
                continue;
            }

            if (! in_array($align, ['left', 'center', 'right'], true)) {
                continue;
            }

            $aligns[$path] = $align;
        }

        $this->merge([
            'columns' => $normalized,
            'aligns' => $aligns,
        ]);
    }
}

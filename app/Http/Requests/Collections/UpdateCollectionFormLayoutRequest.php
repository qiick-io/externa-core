<?php

namespace App\Http\Requests\Collections;

use App\Models\Collection;
use App\Services\Collections\CollectionFormLayoutNormalizer;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates collection form_layout presentation metadata.
 */
class UpdateCollectionFormLayoutRequest extends FormRequest
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
            'form_layout' => ['nullable', 'array'],
            'form_layout.version' => ['sometimes', 'integer'],
            'form_layout.tabs' => ['sometimes', 'array'],
            'form_layout.tabs.*.id' => ['required_with:form_layout.tabs', 'string', 'max:64'],
            'form_layout.tabs.*.label' => ['sometimes', 'array'],
            'form_layout.sections' => ['sometimes', 'array'],
            'form_layout.sections.*.id' => ['sometimes', 'nullable', 'string', 'max:64'],
            'form_layout.sections.*.tab_id' => ['sometimes', 'nullable', 'string', 'max:64'],
            'form_layout.sections.*.label' => ['sometimes', 'array'],
            'form_layout.sections.*.collapsible' => ['sometimes'],
            'form_layout.sections.*.collapsed' => ['sometimes'],
            'form_layout.sections.*.field_ids' => ['sometimes', 'array'],
            'form_layout.sections.*.field_ids.*' => ['integer'],
        ];
    }

    protected function passedValidation(): void
    {
        /** @var Collection $collection */
        $collection = $this->route('collection');

        $layout = $this->input('form_layout');
        if (! is_array($layout)) {
            $this->merge(['form_layout' => null]);

            return;
        }

        $normalized = app(CollectionFormLayoutNormalizer::class)->normalize($layout, $collection);
        $this->merge(['form_layout' => $normalized]);
    }
}

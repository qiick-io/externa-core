<?php

namespace App\Http\Requests\Collections;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates updating a field layout width in the collection form.
 */
class UpdateFieldLayoutWidthRequest extends FormRequest
{
    /**
     * Authorization is enforced by collection route middleware.
     */
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
            'layout_width' => ['required', Rule::in(['half', 'full', 'fill'])],
        ];
    }
}

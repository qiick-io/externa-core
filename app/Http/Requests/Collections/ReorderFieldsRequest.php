<?php

namespace App\Http\Requests\Collections;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates reordering collection fields.
 */
class ReorderFieldsRequest extends FormRequest
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
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', 'distinct'],
            'starts_new_row_ids' => ['sometimes', 'array'],
            'starts_new_row_ids.*' => ['integer', 'distinct'],
        ];
    }
}

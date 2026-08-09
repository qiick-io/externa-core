<?php

namespace App\Http\Requests\Collections;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates reordering collection fields.
 */
class ReorderFieldsRequest extends FormRequest
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
        return [
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', 'distinct'],
            'starts_new_row_ids' => ['sometimes', 'array'],
            'starts_new_row_ids.*' => ['integer', 'distinct'],
            'groups' => ['sometimes', 'array'],
            // Match field name slug rules (hyphens + underscores); group values are parent field names.
            'groups.*' => ['nullable', 'string', 'max:64', 'regex:/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/'],
        ];
    }
}

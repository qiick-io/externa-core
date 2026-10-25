<?php

namespace App\Http\Requests\Collections;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates updating a field layout width in the collection form.
 */
class UpdateFieldLayoutWidthRequest extends FormRequest
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
            'layout_width' => ['required', Rule::in(['half', 'full', 'fill'])],
        ];
    }
}

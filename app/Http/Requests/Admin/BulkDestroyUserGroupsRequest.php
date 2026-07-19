<?php

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates bulk deletion of user groups.
 */
class BulkDestroyUserGroupsRequest extends FormRequest
{
    use AuthorizesWithPermission;

    /**
     * Require permission to delete groups.
     */
    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanDeleteGroups->value);

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', 'exists:user_groups,id'],
        ];
    }
}

<?php

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use App\Support\Validation\StringLimits;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validate creating a user group with memberships and roles.
 */
class StoreUserGroupRequest extends FormRequest
{
    use AuthorizesWithPermission;

    /**
     * Require permission to create groups.
     */
    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanCreateGroups->value);

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:'.StringLimits::NAME, 'unique:user_groups,name'],
            'description' => ['nullable', 'string', 'max:'.StringLimits::DESCRIPTION],
            'user_ids' => ['sometimes', 'array'],
            'user_ids.*' => ['integer', 'exists:users,id'],
            'role_ids' => ['sometimes', 'array'],
            'role_ids.*' => ['integer', 'exists:roles,id,is_assignable,1'],
        ];
    }
}

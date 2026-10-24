<?php

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use App\Http\Requests\Concerns\GuardsSuperAdminGrantsTrait;
use App\Support\Validation\StringLimits;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Validate creating a user group with memberships and roles.
 */
class StoreUserGroupRequest extends FormRequest
{
    use AuthorizesWithPermissionTrait;
    use GuardsSuperAdminGrantsTrait;

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [fn (Validator $validator) => $this->rejectSuperAdminGrants($validator)];
    }

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

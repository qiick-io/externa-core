<?php

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Role;

/**
 * Validate updating a role and its permissions.
 */
class UpdateRoleRequest extends FormRequest
{
    use AuthorizesWithPermission;

    /**
     * Require permission to edit roles.
     */
    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanEditRoles->value);

        /** @var Role $role */
        $role = $this->route('role');

        if ($role->name === RoleEnum::SuperAdmin->value && $this->input('name') !== RoleEnum::SuperAdmin->value) {
            abort(403, 'The super-admin role cannot be renamed.');
        }

        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        /** @var Role $role */
        $role = $this->route('role');
        $guard = config('auth.defaults.guard', 'web');

        return [
            'name' => ['sometimes', 'required', 'string', 'max:255', Rule::unique('roles', 'name')->where('guard_name', $guard)->ignore($role->id)],
            'permission_ids' => ['sometimes', 'array'],
            'permission_ids.*' => ['integer', Rule::exists('permissions', 'id')],
        ];
    }
}

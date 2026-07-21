<?php

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validate creating a role with optional permissions.
 */
class StoreRoleRequest extends FormRequest
{
    use AuthorizesWithPermission;

    /**
     * Require permission to create roles.
     */
    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanCreateRoles->value);

        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $guard = config('auth.defaults.guard', 'web');

        return [
            'name' => ['required', 'string', 'max:255', Rule::unique('roles', 'name')->where('guard_name', $guard)],
            'permission_ids' => ['sometimes', 'array'],
            'permission_ids.*' => ['integer', Rule::exists('permissions', 'id')],
            'collection_permissions' => ['sometimes', 'array'],
            'collection_permissions.*' => ['array'],
            'collection_permissions.*.create' => ['sometimes', 'boolean'],
            'collection_permissions.*.read' => ['sometimes', 'boolean'],
            'collection_permissions.*.update' => ['sometimes', 'boolean'],
            'collection_permissions.*.delete' => ['sometimes', 'boolean'],
            'file_permissions' => ['sometimes', 'array'],
            'file_permissions.create' => ['sometimes', 'boolean'],
            'file_permissions.read' => ['sometimes', 'boolean'],
            'file_permissions.update' => ['sometimes', 'boolean'],
            'file_permissions.delete' => ['sometimes', 'boolean'],
        ];
    }
}

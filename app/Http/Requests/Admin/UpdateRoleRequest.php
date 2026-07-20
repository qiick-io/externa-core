<?php

namespace App\Http\Requests\Admin;

use App\Enums\CollectionPermissionAction;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use App\Models\Role;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

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

        if ($role->isLockedSystemRole() && $this->filled('name') && $this->input('name') !== $role->name) {
            abort(403, 'System roles cannot be renamed.');
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
            'collection_permissions' => ['sometimes', 'array'],
            'collection_permissions.*' => ['array'],
            'collection_permissions.*.create' => ['sometimes', 'boolean'],
            'collection_permissions.*.read' => ['sometimes', 'boolean'],
            'collection_permissions.*.update' => ['sometimes', 'boolean'],
            'collection_permissions.*.delete' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function validated($key = null, $default = null)
    {
        $data = parent::validated($key, $default);

        if ($key !== null) {
            return $data;
        }

        if (isset($data['collection_permissions']) && is_array($data['collection_permissions'])) {
            $normalized = [];
            foreach ($data['collection_permissions'] as $collectionId => $actions) {
                if (! is_array($actions)) {
                    continue;
                }
                $row = [];
                foreach (CollectionPermissionAction::values() as $action) {
                    $row[$action] = (bool) ($actions[$action] ?? false);
                }
                $normalized[(string) $collectionId] = $row;
            }
            $data['collection_permissions'] = $normalized;
        }

        return $data;
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FilePermissionActionEnum;
use App\Models\Role;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Validate updating a role and its permissions.
 */
class UpdateRoleRequest extends FormRequest
{
    /**
     * Require permission to edit roles.
     */
    public function authorize(): bool
    {
        /** @var Role $role */
        $role = $this->route('role');

        Gate::authorize('update', [$role, $this->filled('name') ? $this->input('name') : null]);

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
            'collection_permissions.*.rules' => ['sometimes', 'nullable', 'array'],
            'collection_permissions.*.rules.fields' => ['sometimes', 'array'],
            'collection_permissions.*.rules.fields.*' => ['array'],
            'collection_permissions.*.rules.fields.*.read' => ['sometimes', 'boolean'],
            'collection_permissions.*.rules.fields.*.create' => ['sometimes', 'boolean'],
            'collection_permissions.*.rules.fields.*.update' => ['sometimes', 'boolean'],
            'collection_permissions.*.rules.item_filter' => ['sometimes', 'nullable', 'array'],
            'collection_permissions.*.rules.item_filter.logic' => ['sometimes', 'string', 'in:and'],
            'collection_permissions.*.rules.item_filter.rules' => ['sometimes', 'array'],
            'collection_permissions.*.rules.item_filter.rules.*.field' => ['required_with:collection_permissions.*.rules.item_filter.rules', 'string'],
            'collection_permissions.*.rules.item_filter.rules.*.operator' => ['required_with:collection_permissions.*.rules.item_filter.rules', 'string', 'in:equals,not_equals,empty,not_empty'],
            'collection_permissions.*.rules.item_filter.rules.*.value' => ['sometimes', 'nullable'],
            'file_permissions' => ['sometimes', 'array'],
            'file_permissions.create' => ['sometimes', 'boolean'],
            'file_permissions.read' => ['sometimes', 'boolean'],
            'file_permissions.read_private' => ['sometimes', 'boolean'],
            'file_permissions.update' => ['sometimes', 'boolean'],
            'file_permissions.delete' => ['sometimes', 'boolean'],
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
                foreach (CollectionPermissionActionEnum::values() as $action) {
                    $row[$action] = (bool) ($actions[$action] ?? false);
                }
                if (isset($actions['rules']) && is_array($actions['rules'])) {
                    $row['rules'] = $actions['rules'];
                }
                $normalized[(string) $collectionId] = $row;
            }
            $data['collection_permissions'] = $normalized;
        }

        if (isset($data['file_permissions']) && is_array($data['file_permissions'])) {
            $normalized = [];
            foreach (FilePermissionActionEnum::values() as $action) {
                $normalized[$action] = (bool) ($data['file_permissions'][$action] ?? false);
            }
            $data['file_permissions'] = $normalized;
        }

        return $data;
    }
}

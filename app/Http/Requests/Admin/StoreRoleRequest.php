<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Models\Role;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Validate creating a role with optional permissions.
 */
class StoreRoleRequest extends FormRequest
{
    /**
     * Require permission to create roles.
     */
    public function authorize(): bool
    {
        abort_unless(Gate::allows('create', Role::class), 403);

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
}

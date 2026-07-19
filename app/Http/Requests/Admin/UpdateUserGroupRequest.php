<?php

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use App\Models\UserGroup;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validate updating a user group and its relations.
 */
class UpdateUserGroupRequest extends FormRequest
{
    use AuthorizesWithPermission;

    /**
     * Require permission to edit groups.
     */
    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanEditGroups->value);

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var UserGroup $group */
        $group = $this->route('group');

        return [
            'name' => ['required', 'string', 'max:255', Rule::unique('user_groups', 'name')->ignore($group->id)],
            'description' => ['nullable', 'string'],
            'user_ids' => ['sometimes', 'array'],
            'user_ids.*' => ['integer', 'exists:users,id'],
            'role_ids' => ['sometimes', 'array'],
            'role_ids.*' => ['integer', 'exists:roles,id'],
        ];
    }
}

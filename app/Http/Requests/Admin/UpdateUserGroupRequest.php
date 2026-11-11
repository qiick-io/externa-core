<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Http\Requests\Concerns\GuardsSuperAdminGrantsTrait;
use App\Models\UserGroup;
use App\Support\Validation\StringLimits;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Validate updating a user group and its relations.
 */
class UpdateUserGroupRequest extends FormRequest
{
    use GuardsSuperAdminGrantsTrait;

    /**
     * Require permission to edit groups; groups that grant super-admin are editable by super-admins only.
     */
    public function authorize(): bool
    {
        /** @var UserGroup $group */
        $group = $this->route('group');

        abort_unless(Gate::allows('update', $group), 403);

        return true;
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [fn (Validator $validator) => $this->rejectSuperAdminGrants($validator)];
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var UserGroup $group */
        $group = $this->route('group');

        return [
            'name' => ['required', 'string', 'max:'.StringLimits::NAME, Rule::unique('user_groups', 'name')->ignore($group->id)],
            'description' => ['nullable', 'string', 'max:'.StringLimits::DESCRIPTION],
            'user_ids' => ['sometimes', 'array'],
            'user_ids.*' => ['integer', 'exists:users,id'],
            'role_ids' => ['sometimes', 'array'],
            'role_ids.*' => ['integer', 'exists:roles,id,is_assignable,1'],
        ];
    }
}

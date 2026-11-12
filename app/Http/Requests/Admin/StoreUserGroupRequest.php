<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Http\Requests\Concerns\GuardsSuperAdminGrantsTrait;
use App\Models\UserGroup;
use App\Services\Validation\StringLimitsService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Validator;

/**
 * Validate creating a user group with memberships and roles.
 */
class StoreUserGroupRequest extends FormRequest
{
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
        abort_unless(Gate::allows('create', UserGroup::class), 403);

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:'.StringLimitsService::NAME, 'unique:user_groups,name'],
            'description' => ['nullable', 'string', 'max:'.StringLimitsService::DESCRIPTION],
            'user_ids' => ['sometimes', 'array'],
            'user_ids.*' => ['integer', 'exists:users,id'],
            'role_ids' => ['sometimes', 'array'],
            'role_ids.*' => ['integer', 'exists:roles,id,is_assignable,1'],
        ];
    }
}

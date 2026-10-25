<?php

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use App\Http\Requests\Concerns\GuardsSuperAdminGrantsTrait;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\Validator;

/**
 * Validate creating a new admin user with required role and optional group assignments.
 */
class StoreUserRequest extends FormRequest
{
    use AuthorizesWithPermissionTrait;
    use GuardsSuperAdminGrantsTrait;

    /**
     * Require permission to create users.
     */
    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanCreateUsers->value);

        return true;
    }

    /**
     * Validate new user attributes, credentials, and relation ids.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['nullable', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'username' => ['nullable', 'string', 'max:255', 'unique:users,username'],
            'password' => ['required', 'string', Password::defaults()],
            'is_active' => ['sometimes', 'boolean'],
            'role_ids' => ['required', 'array', 'min:1'],
            'role_ids.*' => ['integer', Rule::exists('roles', 'id')->where('is_assignable', true)],
            'group_ids' => ['sometimes', 'array'],
            'group_ids.*' => ['integer', Rule::exists('user_groups', 'id')],
        ];
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [fn (Validator $validator) => $this->rejectSuperAdminGrants($validator)];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'email.email' => __('Enter a valid email address.'),
            'role_ids.required' => __('Select at least one role.'),
            'role_ids.min' => __('Select at least one role.'),
        ];
    }
}

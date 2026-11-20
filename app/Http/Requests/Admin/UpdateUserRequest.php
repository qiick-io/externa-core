<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Http\Requests\Concerns\GuardsSuperAdminGrantsTrait;
use App\Models\User;
use App\Services\Auth\OidcBreakGlassContinuityService;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Validator;

/**
 * Validate updating an admin user.
 */
class UpdateUserRequest extends FormRequest
{
    use GuardsSuperAdminGrantsTrait;

    /**
     * Require permission to edit users; only super-admins may edit a super-admin account.
     */
    public function authorize(): bool
    {
        /** @var User $targetUser */
        $targetUser = $this->route('user');

        abort_unless(Gate::allows('update', $targetUser), 403);

        return true;
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [
            fn (Validator $validator) => $this->rejectSuperAdminGrants($validator),
            fn (Validator $validator) => $this->rejectLastBreakGlassRemoval($validator),
        ];
    }

    /**
     * Refuse role / active changes that would remove the last SSO-only break-glass admin.
     */
    private function rejectLastBreakGlassRemoval(Validator $validator): void
    {
        if ($validator->errors()->isNotEmpty()) {
            return;
        }

        /** @var User $targetUser */
        $targetUser = $this->route('user');
        $continuity = app(OidcBreakGlassContinuityService::class);

        try {
            if ($this->has('is_active') && filter_var($this->input('is_active'), FILTER_VALIDATE_BOOLEAN) === false) {
                $continuity->assertCanDeactivateOrDelete($targetUser);
            }

            if ($this->has('role_ids')) {
                $continuity->assertCanSyncRoles($targetUser, array_values(array_map('intval', $this->input('role_ids', []))));
            }
        } catch (ValidationException $exception) {
            foreach ($exception->errors() as $field => $messages) {
                foreach ($messages as $message) {
                    $validator->errors()->add($field, $message);
                }
            }
        }
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        /** @var User $user */
        $user = $this->route('user');

        return [
            'first_name' => ['sometimes', 'required', 'string', 'max:255'],
            'last_name' => ['nullable', 'string', 'max:255'],
            'email' => ['sometimes', 'required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'username' => ['nullable', 'string', 'max:255', Rule::unique('users', 'username')->ignore($user->id)],
            'password' => ['nullable', 'string', Password::defaults()],
            'is_active' => ['sometimes', 'boolean'],
            'role_ids' => ['sometimes', 'array'],
            'role_ids.*' => ['integer', Rule::exists('roles', 'id')->where('is_assignable', true)],
            'group_ids' => ['sometimes', 'array'],
            'group_ids.*' => ['integer', Rule::exists('user_groups', 'id')],
        ];
    }
}

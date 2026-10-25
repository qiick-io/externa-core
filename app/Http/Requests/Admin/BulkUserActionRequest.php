<?php

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use App\Services\Authorization\SuperAdminGuardService;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Validates bulk admin actions against users.
 */
class BulkUserActionRequest extends FormRequest
{
    use AuthorizesWithPermissionTrait;

    /**
     * Require the permission that matches the requested bulk action.
     */
    public function authorize(): bool
    {
        $permission = match ($this->input('action')) {
            'restore' => PermissionEnum::CanRestoreUsers->value,
            'force_delete' => PermissionEnum::CanForceDeleteUsers->value,
            default => PermissionEnum::CanDeleteUsers->value,
        };

        $this->authorizePermission($permission);

        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'action' => ['required', 'string', Rule::in(['delete', 'restore', 'force_delete'])],
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', Rule::exists('users', 'id')],
        ];
    }

    /**
     * Reject the whole batch when it touches super-admin accounts and the actor is not a super-admin.
     *
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $superAdminGuard = app(SuperAdminGuardService::class);

            if (
                ! $superAdminGuard->canManageSuperAdmins($this->user())
                && $superAdminGuard->includesSuperAdminUser((array) $this->input('ids', []))
            ) {
                $validator->errors()->add('ids', __('Only a super-admin can change super-admin accounts.'));
            }
        }];
    }
}

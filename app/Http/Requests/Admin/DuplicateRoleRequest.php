<?php

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validate cloning a role into a new uniquely named role.
 */
class DuplicateRoleRequest extends FormRequest
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
        ];
    }
}

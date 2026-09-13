<?php

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Permission;

/**
 * Validate updating a permission record.
 */
class UpdatePermissionRequest extends FormRequest
{
    use AuthorizesWithPermission;

    /**
     * Require permission to edit permissions.
     */
    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanEditPermissions->value);

        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        /** @var Permission $permission */
        $permission = $this->route('permission');
        $guard = config('auth.defaults.guard', 'web');

        return [
            'name' => ['sometimes', 'required', 'string', 'max:255', Rule::unique('permissions', 'name')->where('guard_name', $guard)->ignore($permission->id)],
            'guard_name' => ['sometimes', 'string', 'max:255'],
        ];
    }
}

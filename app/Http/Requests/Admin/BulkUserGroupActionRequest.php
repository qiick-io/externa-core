<?php

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates bulk admin actions against user groups.
 */
class BulkUserGroupActionRequest extends FormRequest
{
    use AuthorizesWithPermission;

    /**
     * Require the permission that matches the requested bulk action.
     */
    public function authorize(): bool
    {
        $permission = match ($this->input('action')) {
            'restore' => PermissionEnum::CanRestoreGroups->value,
            'force_delete' => PermissionEnum::CanForceDeleteGroups->value,
            default => PermissionEnum::CanDeleteGroups->value,
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
            'ids.*' => ['integer', Rule::exists('user_groups', 'id')],
        ];
    }
}

<?php

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Role;

/**
 * Validates bulk admin actions against roles.
 */
class BulkRoleActionRequest extends FormRequest
{
    use AuthorizesWithPermission;

    /**
     * Require permission to delete roles.
     */
    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanDeleteRoles->value);

        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'action' => ['required', 'string', Rule::in(['delete'])],
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', Rule::exists('roles', 'id')],
        ];
    }

    /**
     * @return list<int>
     */
    public function deletableIds(): array
    {
        return collect($this->validated('ids'))
            ->reject(fn (int $id): bool => Role::query()
                ->whereKey($id)
                ->where('name', RoleEnum::SuperAdmin->value)
                ->exists())
            ->values()
            ->all();
    }
}

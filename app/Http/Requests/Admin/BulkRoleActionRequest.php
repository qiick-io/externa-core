<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use App\Models\Role;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

/**
 * Validates bulk admin actions against roles.
 */
class BulkRoleActionRequest extends FormRequest
{
    use AuthorizesWithPermissionTrait;

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
     * Role ids that may be deleted: not protected, and not still referenced by API keys.
     *
     * @return list<int>
     */
    public function deletableIds(): array
    {
        return array_values($this->candidateRoles()
            ->filter(fn (Role $role): bool => ! $this->isProtected($role) && $role->api_keys_count === 0)
            ->map(fn (Role $role): int => (int) $role->id)
            ->all());
    }

    /**
     * How many selected custom roles are kept because API keys still reference them.
     */
    public function skippedApiKeyRoleCount(): int
    {
        return $this->candidateRoles()
            ->filter(fn (Role $role): bool => ! $this->isProtected($role) && $role->api_keys_count > 0)
            ->count();
    }

    /**
     * @return Collection<int, Role>
     */
    private function candidateRoles(): Collection
    {
        /** @var list<int> $ids */
        $ids = $this->validated('ids');

        return Role::query()
            ->whereIn('id', $ids)
            ->withCount('apiKeys')
            ->get();
    }

    private function isProtected(Role $role): bool
    {
        return $role->name === RoleEnum::SuperAdmin->value || $role->isLockedSystemRole();
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Requests\Collections;

use App\Enums\RoleEnum;
use App\Http\Requests\Concerns\AuthorizesCollectionRouteAccessTrait;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolverService;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the "Preview as…" query: a role to impersonate, or the public (anonymous) view.
 *
 * Only super-admins and admins may preview item data through another role's field ACL.
 */
class PreviewCollectionItemAsRoleRequest extends FormRequest
{
    use AuthorizesCollectionRouteAccessTrait;

    /**
     * Whether the user may preview items as another role (super-admin or admin).
     *
     * Shared with the item page, which only lists preview roles for these users.
     */
    public static function canPreviewAsRole(mixed $user): bool
    {
        if (! $user instanceof User) {
            return false;
        }

        $names = app(EffectivePermissionResolverService::class)->roleNamesFor($user);

        return in_array(RoleEnum::SuperAdmin->value, $names, true)
            || in_array(RoleEnum::Admin->value, $names, true);
    }

    /**
     * Item readable by the actor (403 / 404), then super-admin or admin only (403).
     */
    public function authorize(): bool
    {
        $this->authorizeItemRead();
        abort_unless(self::canPreviewAsRole($this->user()), 403);

        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'role_id' => ['nullable', 'integer', 'exists:roles,id'],
            'as_public' => ['nullable', 'boolean'],
        ];
    }
}

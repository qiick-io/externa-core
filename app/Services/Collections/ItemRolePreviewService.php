<?php

namespace App\Services\Collections;

use App\Enums\CollectionPermissionAction;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\Role;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Api\CollectionPermissionGuard;
use App\Services\Api\FileFieldExpander;
use App\Support\Api\ApiAccess;
use App\Support\Collections\CollectionItemDataAccessor;
use App\Support\Collections\CollectionLocaleResolver;
use Illuminate\Http\Request;

/**
 * Simulate a public CMS read of a collection item as a given role (admin preview).
 */
class ItemRolePreviewService
{
    public function __construct(
        private CollectionPermissionGuard $guard,
        private CollectionPermissionEnforcer $enforcer,
        private FileFieldExpander $fileFieldExpander,
        private CollectionItemDataAccessor $dataAccessor,
        private CollectionLocaleResolver $localeResolver,
    ) {}

    /**
     * @return array{
     *     readable: bool,
     *     role: array{id: int, name: string, is_public: bool},
     *     data: array<string, mixed>|null,
     *     message: string|null
     * }
     */
    public function preview(Request $request, Collection $collection, CollectionItem $item, Role $role): array
    {
        $access = new ApiAccess(
            actor: $role->isPublic() ? 'public' : 'api_key',
            role: $role,
        );

        $request->attributes->set('apiAccess', $access);

        $rolePayload = [
            'id' => (int) $role->id,
            'name' => (string) $role->name,
            'is_public' => $role->isPublic(),
        ];

        if (! $this->guard->allows((int) $role->id, (int) $collection->id, CollectionPermissionAction::Read)) {
            return [
                'readable' => false,
                'role' => $rolePayload,
                'data' => null,
                'message' => 'This role has no Read grant on the collection.',
            ];
        }

        if (! $this->enforcer->isItemReadable($request, $collection, $item)) {
            return [
                'readable' => false,
                'role' => $rolePayload,
                'data' => null,
                'message' => 'Item filtered out by this role’s item filter.',
            ];
        }

        $queryLocale = $request->query('locale');
        $override = is_string($queryLocale) && $queryLocale !== '' ? $queryLocale : null;
        $this->localeResolver->assertRequestedLocaleAllowed($override);
        $locale = $this->localeResolver->resolve($override);

        $data = $this->dataAccessor->flattenForLocale($item, $locale, false);
        $data = $this->fileFieldExpander->expand($data, $collection, $access);
        $data = $this->enforcer->stripData($request, $collection, $data);

        return [
            'readable' => true,
            'role' => $rolePayload,
            'data' => $data,
            'message' => null,
        ];
    }

    public function resolveRole(?int $roleId, bool $asPublic): Role
    {
        if ($asPublic) {
            return Role::query()
                ->where('name', RoleEnum::Public->value)
                ->firstOrFail();
        }

        return Role::query()->findOrFail($roleId);
    }
}

<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\CollectionPermissionActionEnum;
use App\Models\Collection;
use App\Models\User;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Support\Authorization\PolicyRequestResolver;
use Illuminate\Auth\Access\Response;

/**
 * Collection-level item actions: role ACL (collection_permissions) for admin users, and role
 * ACL ∩ API key scopes ∩ owner ceiling for API actors.
 *
 * The rules stay in {@see CollectionPermissionEnforcerService}; super-admins are granted there.
 * Field ACL and item_filter query scoping are not abilities and stay in the enforcer too.
 */
final class CollectionPolicy
{
    public function __construct(
        private CollectionPermissionEnforcerService $enforcer,
        private PolicyRequestResolver $requestResolver,
    ) {}

    public function viewItems(?User $user, Collection $collection): Response
    {
        return $this->decide($user, $collection, CollectionPermissionActionEnum::Read);
    }

    public function createItems(?User $user, Collection $collection): Response
    {
        return $this->decide($user, $collection, CollectionPermissionActionEnum::Create);
    }

    public function updateItems(?User $user, Collection $collection): Response
    {
        return $this->decide($user, $collection, CollectionPermissionActionEnum::Update);
    }

    public function deleteItems(?User $user, Collection $collection): Response
    {
        return $this->decide($user, $collection, CollectionPermissionActionEnum::Delete);
    }

    /**
     * Denies with the message {@see CollectionPermissionEnforcerService::assertCollectionAction()} aborts with.
     */
    private function decide(?User $user, Collection $collection, CollectionPermissionActionEnum $action): Response
    {
        $request = $this->requestResolver->forUser($user);

        return $this->enforcer->allowsCollectionAction($request, $collection, $action)
            ? Response::allow()
            : Response::deny(__('This action is unauthorized for the collection.'));
    }
}

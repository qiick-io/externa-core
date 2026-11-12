<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Authorization\PolicyRequestResolverService;
use Illuminate\Auth\Access\Response;

/**
 * Record-level item access: the item must belong to the collection and sit inside the actor's
 * item_filter.
 *
 * The collection is passed explicitly (strict models forbid lazy-loading `$item->collection`).
 * The rules stay in {@see CollectionPermissionEnforcerService}. `update` and `delete` check the
 * record only: callers gate the collection action first through {@see CollectionPolicy}.
 */
final class CollectionItemPolicy
{
    public function __construct(
        private CollectionPermissionEnforcerService $enforcer,
        private PolicyRequestResolverService $requestResolver,
    ) {}

    /**
     * Collection Read grant and item_filter; an unreadable item is answered as not found.
     */
    public function view(?User $user, CollectionItem $item, Collection $collection): Response
    {
        if (! $this->belongsToCollection($item, $collection)) {
            return Response::denyAsNotFound();
        }

        return $this->enforcer->isItemReadable($this->requestResolver->forUser($user), $collection, $item)
            ? Response::allow()
            : Response::denyAsNotFound();
    }

    public function update(?User $user, CollectionItem $item, Collection $collection): Response
    {
        return $this->decideWrite($user, $item, $collection);
    }

    public function delete(?User $user, CollectionItem $item, Collection $collection): Response
    {
        return $this->decideWrite($user, $item, $collection);
    }

    /**
     * Mirrors {@see CollectionPermissionEnforcerService::assertItemWritable()} with its exact 403 messages.
     */
    private function decideWrite(?User $user, CollectionItem $item, Collection $collection): Response
    {
        if (! $this->belongsToCollection($item, $collection)) {
            return Response::denyAsNotFound();
        }

        $denialMessage = $this->enforcer->itemWriteDenialMessage(
            $this->requestResolver->forUser($user),
            $collection,
            $item,
        );

        return $denialMessage === null ? Response::allow() : Response::deny($denialMessage);
    }

    private function belongsToCollection(CollectionItem $item, Collection $collection): bool
    {
        return $item->collection_id === $collection->id;
    }
}

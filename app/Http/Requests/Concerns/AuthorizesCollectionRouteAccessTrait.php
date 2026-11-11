<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Enums\CollectionPermissionActionEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Policies\CollectionItemPolicy;
use App\Policies\CollectionPolicy;
use Illuminate\Support\Facades\Gate;

/**
 * Collection ACL gates for admin form requests bound to `{collection}` (and `{item}`) routes.
 *
 * The item controllers used to run these checks before `$request->validate()`. A form request
 * validates before the controller body, so the same checks run in `authorize()` instead: callers
 * keep getting 403 / 404 (not 422) when they may not touch the collection or the item. The rules
 * live in {@see CollectionPolicy} and {@see CollectionItemPolicy}.
 */
trait AuthorizesCollectionRouteAccessTrait
{
    /**
     * The `{collection}` route model.
     */
    protected function routeCollection(): Collection
    {
        /** @var Collection $collection */
        $collection = $this->route('collection');

        return $collection;
    }

    /**
     * The `{item}` route model.
     */
    protected function routeItem(): CollectionItem
    {
        /** @var CollectionItem $item */
        $item = $this->route('item');

        return $item;
    }

    /**
     * Abort with 403 unless the actor holds the collection grant for the action.
     */
    protected function authorizeCollectionAction(CollectionPermissionActionEnum $action): void
    {
        Gate::forUser($this->user())->authorize($action->itemsAbility(), $this->routeCollection());
    }

    /**
     * Collection read grant (403), then item in the collection and inside the read filter (404).
     *
     * `abort_unless` keeps the empty 404 message: the policy's not-found denial would render
     * "Not Found" instead.
     */
    protected function authorizeItemRead(): void
    {
        $this->authorizeCollectionAction(CollectionPermissionActionEnum::Read);
        abort_unless(
            Gate::forUser($this->user())->allows('view', [$this->routeItem(), $this->routeCollection()]),
            404,
        );
    }

    /**
     * Collection update grant (403), item in the collection (404) and item inside the write filter (403).
     *
     * The collection membership check stays an `abort_if` for the same empty 404 message.
     */
    protected function authorizeItemWrite(): void
    {
        $this->authorizeCollectionAction(CollectionPermissionActionEnum::Update);
        abort_if($this->routeItem()->collection_id !== $this->routeCollection()->id, 404);
        Gate::forUser($this->user())->authorize('update', [$this->routeItem(), $this->routeCollection()]);
    }
}

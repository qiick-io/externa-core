<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Enums\CollectionPermissionActionEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcerService;

/**
 * Collection ACL gates for admin form requests bound to `{collection}` (and `{item}`) routes.
 *
 * The item controllers used to run these checks before `$request->validate()`. A form request
 * validates before the controller body, so the same checks run in `authorize()` instead: callers
 * keep getting 403 / 404 (not 422) when they may not touch the collection or the item.
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
        app(CollectionPermissionEnforcerService::class)->assertCollectionAction(
            $this,
            $this->routeCollection(),
            $action,
        );
    }

    /**
     * Collection read grant, item in the collection (404) and item inside the read filter (404).
     */
    protected function authorizeItemRead(): void
    {
        $this->authorizeCollectionAction(CollectionPermissionActionEnum::Read);
        abort_if($this->routeItem()->collection_id !== $this->routeCollection()->id, 404);
        app(CollectionPermissionEnforcerService::class)->assertItemReadable(
            $this,
            $this->routeCollection(),
            $this->routeItem(),
        );
    }

    /**
     * Collection update grant, item in the collection (404) and item inside the write filter (403).
     */
    protected function authorizeItemWrite(): void
    {
        $this->authorizeCollectionAction(CollectionPermissionActionEnum::Update);
        abort_if($this->routeItem()->collection_id !== $this->routeCollection()->id, 404);
        app(CollectionPermissionEnforcerService::class)->assertItemWritable(
            $this,
            $this->routeCollection(),
            $this->routeItem(),
        );
    }
}

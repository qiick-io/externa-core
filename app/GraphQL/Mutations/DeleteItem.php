<?php

namespace App\GraphQL\Mutations;

use App\Enums\CollectionPermissionAction;
use App\GraphQL\Concerns\AuthorizesGraphqlCollection;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcer;

final class DeleteItem
{
    use AuthorizesGraphqlCollection;

    /**
     * @param  array{collection: string, id: string}  $args
     */
    public function __invoke(mixed $_, array $args): bool
    {
        $collection = $this->findCollection($args['collection']);
        $this->authorize($collection, CollectionPermissionAction::Delete);

        $item = CollectionItem::query()
            ->where('collection_id', $collection->id)
            ->whereKey($args['id'])
            ->first();
        if ($item === null) {
            abort(404);
        }

        app(CollectionPermissionEnforcer::class)->assertItemWritable(request(), $collection, $item);
        $item->delete();

        return true;
    }
}

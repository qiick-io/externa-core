<?php

namespace App\GraphQL\Mutations;

use App\Enums\CollectionPermissionActionEnum;
use App\GraphQL\Concerns\AuthorizesGraphqlCollectionTrait;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcer;

final class DeleteItem
{
    use AuthorizesGraphqlCollectionTrait;

    /**
     * @param  array{collection: string, id: string}  $args
     */
    public function __invoke(mixed $_, array $args): bool
    {
        $collection = $this->findCollection($args['collection']);
        $this->authorize($collection, CollectionPermissionActionEnum::Delete);

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

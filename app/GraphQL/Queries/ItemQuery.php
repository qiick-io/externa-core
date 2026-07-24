<?php

namespace App\GraphQL\Queries;

use App\Enums\CollectionPermissionAction;
use App\GraphQL\Concerns\AuthorizesGraphqlCollection;
use App\Http\Resources\CollectionItemResource;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcer;

final class ItemQuery
{
    use AuthorizesGraphqlCollection;

    /**
     * @param  array{collection: string, id: string}  $args
     * @return array<string, mixed>|null
     */
    public function __invoke(mixed $_, array $args): ?array
    {
        $collection = $this->findCollection($args['collection']);
        $this->authorize($collection, CollectionPermissionAction::Read);

        $item = CollectionItem::query()
            ->where('collection_id', $collection->id)
            ->whereKey($args['id'])
            ->with(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])])
            ->first();

        if ($item === null) {
            return null;
        }

        $request = request();
        app(CollectionPermissionEnforcer::class)->assertItemReadable($request, $collection, $item);

        return (new CollectionItemResource($item))->toArray($request);
    }
}

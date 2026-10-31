<?php

namespace App\GraphQL\Mutations;

use App\Actions\Collections\UpdateCollectionItemAction;
use App\Data\Collections\CollectionItemWriteData;
use App\Enums\CollectionPermissionActionEnum;
use App\GraphQL\Concerns\AuthorizesGraphqlCollectionTrait;
use App\Http\Resources\CollectionItemResource;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcer;

final class UpdateItem
{
    use AuthorizesGraphqlCollectionTrait;

    /**
     * @param  array{collection: string, id: string, data: array<string, mixed>}  $args
     * @return array<string, mixed>
     */
    public function __invoke(mixed $_, array $args): array
    {
        $collection = $this->findCollection($args['collection']);
        $this->authorize($collection, CollectionPermissionActionEnum::Update);

        $item = CollectionItem::query()
            ->where('collection_id', $collection->id)
            ->whereKey($args['id'])
            ->first();
        if ($item === null) {
            abort(404);
        }

        $request = request();
        app(CollectionPermissionEnforcer::class)->assertItemWritable($request, $collection, $item);

        $data = is_array($args['data'] ?? null) ? $args['data'] : [];

        $item = app(UpdateCollectionItemAction::class)->execute(new CollectionItemWriteData(
            collection: $collection,
            data: $data,
            item: $item,
            creating: false,
            version: $collection->versioning ? 'draft' : 'published',
            request: $request,
            shouldAssertWritableFields: true,
            writableMode: 'update',
        ));

        $item->load(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])]);

        return (new CollectionItemResource($item))->toArray($request);
    }
}

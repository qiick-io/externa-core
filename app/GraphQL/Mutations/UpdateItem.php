<?php

namespace App\GraphQL\Mutations;

use App\Enums\CollectionPermissionActionEnum;
use App\GraphQL\Concerns\AuthorizesGraphqlCollectionTrait;
use App\Http\Resources\CollectionItemResource;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;

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
        $enforcer = app(CollectionPermissionEnforcer::class);
        $enforcer->assertItemWritable($request, $collection, $item);

        $data = is_array($args['data'] ?? null) ? $args['data'] : [];
        $enforcer->assertWritableFields($request, $collection, $data, 'update');

        $normalizer = app(CollectionItemDataNormalizer::class);
        $merged = $normalizer->mergeIncoming(app(CollectionItemValuesAssembler::class)->assemble($item), $data);
        $normalized = $normalizer->normalize($collection, $merged, false);
        app(CollectionItemValuesWriter::class)->sync($item, $collection, $normalized);
        $item->load(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])]);

        return (new CollectionItemResource($item))->toArray($request);
    }
}

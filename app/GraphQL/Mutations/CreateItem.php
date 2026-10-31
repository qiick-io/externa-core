<?php

namespace App\GraphQL\Mutations;

use App\Actions\Collections\CreateCollectionItemAction;
use App\Data\Collections\CollectionItemWriteData;
use App\Enums\CollectionPermissionActionEnum;
use App\GraphQL\Concerns\AuthorizesGraphqlCollectionTrait;
use App\Http\Resources\CollectionItemResource;

final class CreateItem
{
    use AuthorizesGraphqlCollectionTrait;

    /**
     * @param  array{collection: string, data: array<string, mixed>}  $args
     * @return array<string, mixed>
     */
    public function __invoke(mixed $_, array $args): array
    {
        $collection = $this->findCollection($args['collection']);
        $this->authorize($collection, CollectionPermissionActionEnum::Create);

        $data = is_array($args['data'] ?? null) ? $args['data'] : [];
        $request = request();

        $item = app(CreateCollectionItemAction::class)->execute(new CollectionItemWriteData(
            collection: $collection,
            data: $data,
            creating: true,
            request: $request,
            shouldAssertWritableFields: true,
            writableMode: 'create',
        ));

        $item->load(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])]);

        return (new CollectionItemResource($item))->toArray($request);
    }
}

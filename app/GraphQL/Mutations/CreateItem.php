<?php

namespace App\GraphQL\Mutations;

use App\Enums\CollectionPermissionAction;
use App\GraphQL\Concerns\AuthorizesGraphqlCollection;
use App\Http\Resources\CollectionItemResource;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use Illuminate\Validation\ValidationException;

final class CreateItem
{
    use AuthorizesGraphqlCollection;

    /**
     * @param  array{collection: string, data: array<string, mixed>}  $args
     * @return array<string, mixed>
     */
    public function __invoke(mixed $_, array $args): array
    {
        $collection = $this->findCollection($args['collection']);
        $this->authorize($collection, CollectionPermissionAction::Create);

        if ($collection->is_singleton && $collection->items()->exists()) {
            throw ValidationException::withMessages([
                'collection' => ['Singleton already has content.'],
            ]);
        }

        $data = is_array($args['data'] ?? null) ? $args['data'] : [];
        $request = request();
        app(CollectionPermissionEnforcer::class)->assertWritableFields($request, $collection, $data, 'create');

        $normalized = app(CollectionItemDataNormalizer::class)->normalize($collection, $data, true);
        $item = $collection->items()->create([]);
        app(CollectionItemValuesWriter::class)->sync($item, $collection, $normalized);
        $item->load(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])]);

        return (new CollectionItemResource($item))->toArray($request);
    }
}

<?php

namespace App\Http\Resources;

use App\Models\CollectionItem;
use App\Support\Collections\CollectionItemDataAccessor;
use App\Support\Collections\CollectionLocaleResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Serialize a collection item with locale-aware flattened field data.
 *
 * @mixin CollectionItem
 */
class CollectionItemResource extends JsonResource
{
    /**
     * Transform the item into an API/Inertia array using the resolved locale.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var CollectionItem $item */
        $item = $this->resource;
        $item->loadMissing('collection.fields');

        $includeAll = $request->boolean('include_all_translations');
        $locale = app(CollectionLocaleResolver::class)->resolve($request->query('locale') ? (string) $request->query('locale') : null);

        $data = app(CollectionItemDataAccessor::class)->flattenForLocale($item, $locale, $includeAll);

        return [
            'id' => $item->id,
            'collection_id' => $item->collection_id,
            'data' => $data,
            'created_at' => $item->created_at?->toIso8601String(),
            'updated_at' => $item->updated_at?->toIso8601String(),
        ];
    }
}

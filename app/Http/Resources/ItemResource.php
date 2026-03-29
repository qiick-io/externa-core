<?php

namespace App\Http\Resources;

use App\Models\CollectionItem;
use App\Support\Collections\ItemDataAccessor;
use App\Support\Collections\LocaleResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin CollectionItem
 */
class ItemResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var CollectionItem $item */
        $item = $this->resource;
        $item->loadMissing('collection.fields');

        $includeAll = $request->boolean('include_all_translations');
        $locale = app(LocaleResolver::class)->resolve($request->query('locale') ? (string) $request->query('locale') : null);

        $data = app(ItemDataAccessor::class)->flattenForLocale($item, $locale, $includeAll);

        return [
            'id' => $item->id,
            'collection_id' => $item->collection_id,
            'data' => $data,
            'created_at' => $item->created_at?->toIso8601String(),
            'updated_at' => $item->updated_at?->toIso8601String(),
        ];
    }
}

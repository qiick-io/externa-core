<?php

namespace App\Http\Resources;

use App\Models\Item;
use App\Support\Cms\ItemDataAccessor;
use App\Support\Cms\LocaleResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Item
 */
class ItemResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Item $item */
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

<?php

declare(strict_types=1);

namespace App\Mcp\Resources;

use App\Ai\Concerns\EnforcesAiCollectionPermissionsTrait;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionItem as CollectionItemModel;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Collections\CollectionItemValuesAssemblerService;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\ResponseFactory;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\MimeType;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Contracts\HasUriTemplate;
use Laravel\Mcp\Server\Resource;
use Laravel\Mcp\Support\UriTemplate;

#[Name('collection_item')]
#[Title('Collection item')]
#[Description('A single collection item by collection slug and item id (permission-aware, same as get_item).')]
#[MimeType('application/json')]
class CollectionItem extends Resource implements HasUriTemplate
{
    use EnforcesAiCollectionPermissionsTrait;

    public function uriTemplate(): UriTemplate
    {
        return new UriTemplate('externa://items/{collection}/{id}');
    }

    public function handle(Request $request): Response|ResponseFactory
    {
        $user = auth()->user();

        if (! $user instanceof User) {
            return Response::error('Unauthenticated.');
        }

        if (! app(EffectivePermissionResolverService::class)->hasPermission($user, PermissionEnum::CanShowCollections->value)) {
            return Response::error('Item not found.');
        }

        $slug = (string) $request->get('collection', '');
        $itemId = (int) $request->get('id', 0);

        $collection = Collection::query()->where('slug', $slug)->first();

        if ($collection === null) {
            return Response::error('Item not found.');
        }

        $item = CollectionItemModel::query()
            ->where('collection_id', $collection->id)
            ->whereKey($itemId)
            ->first();

        if ($item === null || $this->guardAiItemReadable($collection, $item) !== null) {
            return Response::error('Item not found.');
        }

        $data = $this->stripAiItemData($collection, app(CollectionItemValuesAssemblerService::class)->assemble($item));

        return Response::structured([
            'id' => $item->id,
            'collection_id' => $collection->id,
            'collection_slug' => $collection->slug,
            'data' => $data,
        ]);
    }
}

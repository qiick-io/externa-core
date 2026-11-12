<?php

namespace App\Http\Resources;

use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Api\FileFieldExpanderService;
use App\Services\Api\RelationIncludeHydratorService;
use App\Services\Collections\CollectionItemDataAccessorService;
use App\Services\Collections\CollectionLocaleResolverService;
use App\Support\Api\ApiAccess;
use App\Support\Api\MiniUserMapper;
use App\Support\Api\PublicApiIncludeParser;
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
        $resolver = app(CollectionLocaleResolverService::class);
        $queryLocale = $request->query('locale');
        $override = is_string($queryLocale) && $queryLocale !== '' ? $queryLocale : null;
        $resolver->assertRequestedLocaleAllowed($override);
        $locale = $resolver->resolve($override);

        $data = app(CollectionItemDataAccessorService::class)->flattenForLocale($item, $locale, $includeAll);

        $isPublicV1 = $request->is('api/v1/*');
        $includeParser = app(PublicApiIncludeParser::class);
        $include = $isPublicV1 ? $includeParser->parse($request->query('include')) : [];

        // Public REST v1: slim by default; GraphQL / other api/* keep always-expand-files.
        $wantsFiles = $isPublicV1
            ? $includeParser->has($include, PublicApiIncludeParser::TOKEN_FILES)
            : $request->is('api/*');
        $wantsUsers = $isPublicV1
            ? $includeParser->has($include, PublicApiIncludeParser::TOKEN_USERS)
            : true;

        if ($wantsFiles && $item->collection !== null) {
            $access = $request->attributes->get('apiAccess');
            if (! $access instanceof ApiAccess) {
                try {
                    $access = app(ApiAccess::class);
                } catch (\Throwable) {
                    $access = null;
                }
            }

            $data = app(FileFieldExpanderService::class)->expand($data, $item->collection, $access);
        }

        if ($isPublicV1 && $item->collection !== null && $include !== []) {
            $data = app(RelationIncludeHydratorService::class)->hydrate($data, $item->collection, $include, $request);
        }

        if ($item->collection !== null) {
            $data = app(CollectionPermissionEnforcerService::class)
                ->stripData($request, $item->collection, $data);
        }

        if ($wantsUsers) {
            $item->loadMissing(['userCreated:id,first_name,last_name,email', 'userUpdated:id,first_name,last_name,email']);
        }

        return [
            'id' => $item->id,
            'collection_id' => $item->collection_id,
            'data' => $data,
            'created_at' => $item->created_at?->toIso8601String(),
            'updated_at' => $item->updated_at?->toIso8601String(),
            'published_at' => $item->published_at?->toIso8601String(),
            'user_created_id' => $item->user_created_id,
            'user_updated_id' => $item->user_updated_id,
            'user_created' => $wantsUsers ? app(MiniUserMapper::class)->toArray($item->userCreated) : null,
            'user_updated' => $wantsUsers ? app(MiniUserMapper::class)->toArray($item->userUpdated) : null,
        ];
    }
}

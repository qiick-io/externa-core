<?php

namespace App\Http\Resources;

use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Api\FileFieldExpander;
use App\Support\Api\ApiAccess;
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
        $resolver = app(CollectionLocaleResolver::class);
        $queryLocale = $request->query('locale');
        $override = is_string($queryLocale) && $queryLocale !== '' ? $queryLocale : null;
        $resolver->assertRequestedLocaleAllowed($override);
        $locale = $resolver->resolve($override);

        $data = app(CollectionItemDataAccessor::class)->flattenForLocale($item, $locale, $includeAll);

        // Expand file fields only on public CMS API surfaces (admin forms keep raw IDs).
        if ($request->is('api/*') && $item->collection !== null) {
            $access = $request->attributes->get('apiAccess');
            if (! $access instanceof ApiAccess) {
                try {
                    $access = app(ApiAccess::class);
                } catch (\Throwable) {
                    $access = null;
                }
            }

            $data = app(FileFieldExpander::class)->expand($data, $item->collection, $access);
        }

        if ($item->collection !== null) {
            $data = app(CollectionPermissionEnforcer::class)
                ->stripData($request, $item->collection, $data);
        }

        $item->loadMissing(['userCreated:id,first_name,last_name,email', 'userUpdated:id,first_name,last_name,email']);

        return [
            'id' => $item->id,
            'collection_id' => $item->collection_id,
            'data' => $data,
            'created_at' => $item->created_at?->toIso8601String(),
            'updated_at' => $item->updated_at?->toIso8601String(),
            'user_created_id' => $item->user_created_id,
            'user_updated_id' => $item->user_updated_id,
            'user_created' => $this->miniUser($item->userCreated),
            'user_updated' => $this->miniUser($item->userUpdated),
        ];
    }

    /**
     * @return array{id: int, name: string, email: string|null}|null
     */
    private function miniUser(?User $user): ?array
    {
        if ($user === null) {
            return null;
        }

        return [
            'id' => (int) $user->id,
            'name' => $user->name !== '' ? $user->name : ($user->email ?? ('#'.$user->id)),
            'email' => $user->email,
        ];
    }
}

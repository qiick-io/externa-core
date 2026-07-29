<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\CollectionPermissionAction;
use App\Http\Controllers\Api\V1\Concerns\AuthorizesCollectionAccess;
use App\Http\Controllers\Controller;
use App\Models\Collection;
use App\Services\Api\CollectionPermissionGuard;
use App\Services\Api\PublicApiResponseCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public CMS API: list and show collections the actor may read.
 */
class CollectionController extends Controller
{
    use AuthorizesCollectionAccess;

    public function __construct(
        private PublicApiResponseCache $responseCache,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $access = $this->apiAccess($request);
        $matrix = app(CollectionPermissionGuard::class)->matrixForRole($access->roleId());
        $readableIds = [];
        foreach ($matrix as $collectionId => $actions) {
            if (($actions['read'] ?? false) === true) {
                $readableIds[] = (int) $collectionId;
            }
        }

        $collections = Collection::query()
            ->whereIn('id', $readableIds !== [] ? $readableIds : [-1])
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get(['id', 'name', 'slug', 'is_singleton', 'sort_order']);

        return response()->json([
            'data' => $collections->map(fn (Collection $collection): array => [
                'id' => $collection->id,
                'name' => $collection->name,
                'slug' => $collection->slug,
                'is_singleton' => (bool) $collection->is_singleton,
            ])->values()->all(),
        ]);
    }

    public function show(Request $request, string $slug): JsonResponse
    {
        $collection = $this->findCollectionBySlug($slug);
        $this->authorizeCollection($request, $collection, CollectionPermissionAction::Read);

        $version = $this->responseCache->version((int) $collection->id);
        $key = $this->responseCache->collectionKey($slug, $version);

        $payload = $this->responseCache->remember($key, function () use ($collection): array {
            $collection->load(['fields' => fn ($q) => $q->ordered()]);

            return [
                'data' => [
                    'id' => $collection->id,
                    'name' => $collection->name,
                    'slug' => $collection->slug,
                    'is_singleton' => (bool) $collection->is_singleton,
                    'fields' => $collection->fields->map(fn ($field): array => [
                        'id' => $field->id,
                        'name' => $field->name,
                        'type' => $field->type instanceof \BackedEnum ? $field->type->value : $field->type,
                        'settings' => $field->settings,
                    ])->values()->all(),
                ],
            ];
        });

        return response()->json($payload);
    }
}

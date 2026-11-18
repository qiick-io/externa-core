<?php

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Http\Requests\Ai\SearchAiContextFilesRequest;
use App\Http\Requests\Ai\SearchAiContextItemsRequest;
use App\Http\Requests\Ai\SearchAiPickerRequest;
use App\Models\Collection;
use App\Models\User;
use App\Services\Ai\AiConversationContextService;
use App\Services\Api\CollectionPermissionEnforcerService;
use Illuminate\Http\JsonResponse;

/**
 * Permission-filtered item/file search for the AppAssistant context attach picker.
 */
class AiContextSearchController extends Controller
{
    public function __construct(
        private readonly AiConversationContextService $contextService,
        private readonly CollectionPermissionEnforcerService $permissionEnforcer,
    ) {}

    /**
     * List collections the actor may read (for the item attach picker).
     */
    public function collections(SearchAiPickerRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validated();

        $search = isset($validated['search']) ? trim((string) $validated['search']) : '';

        $collections = Collection::query()
            ->when($search !== '', function ($query) use ($search): void {
                $like = '%'.$search.'%';
                $query->where(function ($builder) use ($like): void {
                    $builder->where('name', 'like', $like)
                        ->orWhere('slug', 'like', $like);
                });
            })
            ->orderBy('name')
            ->limit(100)
            ->get(['id', 'name', 'slug']);

        $readable = $collections
            ->filter(fn (Collection $collection): bool => $this->permissionEnforcer->isCollectionReadable($request, $collection))
            ->values()
            ->map(fn (Collection $collection): array => [
                'id' => $collection->id,
                'name' => $collection->name,
                'slug' => $collection->slug,
            ])
            ->all();

        return response()->json(['collections' => $readable]);
    }

    /**
     * Search items the actor may read.
     */
    public function items(SearchAiContextItemsRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validated();

        $items = $this->contextService->searchItems(
            $user,
            $request,
            isset($validated['collection_id']) ? (int) $validated['collection_id'] : null,
            $validated['search'] ?? null,
            (int) ($validated['limit'] ?? 20),
        );

        return response()->json(['items' => $items]);
    }

    /**
     * Search files the actor may list.
     */
    public function files(SearchAiContextFilesRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validated();

        $files = $this->contextService->searchFiles(
            $user,
            $validated['search'] ?? null,
            (int) ($validated['limit'] ?? 20),
        );

        return response()->json(['files' => $files]);
    }
}

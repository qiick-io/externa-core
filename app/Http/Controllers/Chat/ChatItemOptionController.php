<?php

declare(strict_types=1);

namespace App\Http\Controllers\Chat;

use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\ListChatItemOptionsRequest;
use App\Http\Requests\Chat\ListChatItemPickerRequest;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Chat\ChatService;
use App\Services\Collections\CollectionItemOptionsService;
use App\Traits\PaginatesChatOptionRowsTrait;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Hub option search for item chats: readable collections, items of one
 * collection, and the grouped item picker.
 */
class ChatItemOptionController extends Controller
{
    use PaginatesChatOptionRowsTrait;

    public function __construct(
        private ChatService $chats,
        private CollectionPermissionEnforcerService $permissionEnforcer,
        private CollectionItemOptionsService $itemOptions,
    ) {}

    public function collections(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $q = trim((string) $request->query('q', ''));
        $rows = Collection::query()
            ->when($q !== '', fn ($query) => $query->where('name', 'like', '%'.$q.'%'))
            ->orderBy('name')
            ->limit(40)
            ->get(['id', 'name']);

        return response()->json([
            'collections' => $rows
                ->filter(fn (Collection $collection): bool => $this->chats->canUserReadCollection($user, $collection))
                ->take(20)
                ->map(fn (Collection $collection): array => [
                    'id' => (int) $collection->id,
                    'name' => $collection->name,
                ])
                ->values()
                ->all(),
        ]);
    }

    public function items(ListChatItemOptionsRequest $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();

        $collection = Collection::query()->findOrFail($validated['collection_id']);
        abort_unless($this->chats->canUserReadCollection($user, $collection), 404);

        $page = $this->itemOptions->paginateForCollection(
            $collection,
            'title',
            null,
            [],
            trim((string) ($validated['q'] ?? '')) ?: null,
            20,
        );

        $data = [];
        foreach ($page->items() as $row) {
            $item = CollectionItem::query()->find($row['id'] ?? null);
            if (! $item instanceof CollectionItem) {
                continue;
            }
            if (! $this->permissionEnforcer->isItemReadable($request, $collection, $item)) {
                continue;
            }
            $data[] = [
                'id' => (int) $item->id,
                'label' => $row['label'] ?? $this->chats->itemLabel($item),
            ];
        }

        return response()->json(['items' => $data]);
    }

    public function itemPicker(ListChatItemPickerRequest $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();

        $q = trim((string) ($validated['q'] ?? ''));
        $page = (int) ($validated['page'] ?? 1);
        $perPage = (int) ($validated['per_page'] ?? 15);

        // ponytail: scan readable collections then first 100 items each. Ceiling: huge catalogs; upgrade: SQL join + item ACL.
        $groups = [];
        $collections = Collection::query()->orderBy('name')->get(['id', 'name']);

        foreach ($collections as $collection) {
            if (! $this->chats->canUserReadCollection($user, $collection)) {
                continue;
            }

            $nameMatches = $q === '' || mb_stripos($collection->name, $q) !== false;
            $itemSearch = $nameMatches ? null : ($q !== '' ? $q : null);

            $itemPage = $this->itemOptions->paginateForCollection(
                $collection,
                'title',
                null,
                [],
                $itemSearch,
                100,
            );

            $labels = [];
            $ids = [];
            foreach ($itemPage->items() as $row) {
                $id = (int) ($row['id'] ?? 0);
                if ($id < 1) {
                    continue;
                }
                $ids[] = $id;
                $labels[$id] = (string) ($row['label'] ?? '');
            }

            if ($ids === []) {
                continue;
            }

            $models = CollectionItem::query()->whereIn('id', $ids)->get()->keyBy('id');
            $items = [];
            foreach ($ids as $id) {
                $item = $models->get($id);
                if (! $item instanceof CollectionItem) {
                    continue;
                }
                if (! $this->permissionEnforcer->isItemReadable($request, $collection, $item)) {
                    continue;
                }
                $label = $labels[$id] !== '' ? $labels[$id] : $this->chats->itemLabel($item);
                $items[] = [
                    'id' => $id,
                    'label' => $label,
                ];
            }

            if ($items === []) {
                continue;
            }

            $groups[] = [
                'id' => (int) $collection->id,
                'name' => $collection->name,
                'items' => $items,
            ];
        }

        return response()->json($this->paginateRows($groups, $page, $perPage));
    }
}

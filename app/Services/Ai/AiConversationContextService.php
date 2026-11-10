<?php

namespace App\Services\Ai;

use App\Enums\PermissionEnum;
use App\Models\AiPrompt;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\File;
use App\Models\User;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Collections\CollectionItemValuesAssemblerService;
use Illuminate\Http\Request;
use Illuminate\Support\Collection as SupportCollection;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Resolve and authorize AppAssistant conversation context attachments (items, files, prompts).
 *
 * AuthZ is re-checked at send time so revoked access cannot leak into the model prompt.
 */
class AiConversationContextService
{
    public const MAX_ITEMS = 10;

    public const MAX_FILES = 10;

    public const MAX_PROMPTS = 5;

    public function __construct(
        private readonly CollectionPermissionEnforcerService $permissionEnforcer,
        private readonly CollectionItemValuesAssemblerService $itemAssembler,
        private readonly EffectivePermissionResolverService $permissionResolver,
    ) {}

    /**
     * Validate requested context IDs against current AuthZ and build prompt + display payloads.
     *
     * @param  list<int>  $itemIds
     * @param  list<int>  $fileIds
     * @param  list<int>  $promptIds
     * @return array{
     *     prompt_suffix: string,
     *     display: list<array{type: string, id: int|string, name: string, mime?: string|null, size?: int|null, collection_id?: int, collection_name?: string}>
     * }
     *
     * @throws HttpException When any requested context target is missing or unauthorized.
     */
    public function resolveForSend(
        User $user,
        Request $request,
        array $itemIds,
        array $fileIds,
        array $promptIds,
    ): array {
        $items = $this->resolveItems($user, $request, $itemIds);
        $files = $this->resolveFiles($user, $fileIds);
        $prompts = $this->resolvePrompts($promptIds);

        return [
            'prompt_suffix' => $this->buildPromptSuffix($items, $files, $prompts),
            'display' => $this->buildDisplayMeta($items, $files, $prompts),
        ];
    }

    /**
     * Search collection items the actor may read for the attach picker.
     *
     * @return list<array{id: int, collection_id: int, collection_name: string, collection_slug: string, label: string}>
     */
    public function searchItems(User $user, Request $request, ?int $collectionId, ?string $search, int $limit = 20): array
    {
        if (! $this->permissionResolver->hasPermission($user, PermissionEnum::CanShowCollections->value)) {
            return [];
        }

        $limit = min(max($limit, 1), 50);
        $search = $search !== null ? trim($search) : '';

        $collectionsQuery = Collection::query()->orderBy('name');

        if ($collectionId !== null) {
            $collectionsQuery->whereKey($collectionId);
        }

        $collections = $collectionsQuery->limit($collectionId !== null ? 1 : 50)->get();
        $results = [];

        foreach ($collections as $collection) {
            if (! $this->permissionEnforcer->isCollectionReadable($request, $collection)) {
                continue;
            }

            $query = $collection->items()->getQuery()->latest('id');
            $this->permissionEnforcer->applyItemFilterToQuery($request, $collection, $query);

            if ($search !== '') {
                if (ctype_digit($search)) {
                    $query->where(function ($builder) use ($search): void {
                        $builder->where('collections_items.id', (int) $search)
                            ->orWhereHas('fieldValues', function ($values) use ($search): void {
                                $values->where('value', 'like', '%'.$search.'%');
                            });
                    });
                } else {
                    $like = '%'.$search.'%';
                    $query->whereHas('fieldValues', function ($values) use ($like): void {
                        $values->where('value', 'like', $like);
                    });
                }
            }

            foreach ($query->limit($limit)->get() as $item) {
                if (! $this->permissionEnforcer->isItemReadable($request, $collection, $item)) {
                    continue;
                }

                $data = $this->permissionEnforcer->stripData(
                    $request,
                    $collection,
                    $this->itemAssembler->assemble($item),
                );

                $results[] = [
                    'id' => $item->id,
                    'collection_id' => $collection->id,
                    'collection_name' => $collection->name,
                    'collection_slug' => $collection->slug,
                    'label' => $this->itemLabel($item->id, $data),
                ];

                if (count($results) >= $limit) {
                    return $results;
                }
            }
        }

        return $results;
    }

    /**
     * Search files the actor may list for the attach picker.
     *
     * @return list<array{id: int, name: string, mime: string|null, size: int|null, type: string}>
     */
    public function searchFiles(User $user, ?string $search, int $limit = 20): array
    {
        if (! $this->permissionResolver->hasPermission($user, PermissionEnum::CanShowFiles->value)) {
            return [];
        }

        $limit = min(max($limit, 1), 50);
        $search = $search !== null ? trim($search) : '';

        $query = File::query()->whereNull('deleted_at')->latest('id');

        if ($search !== '') {
            if (ctype_digit($search)) {
                $query->where(function ($builder) use ($search): void {
                    $builder->where('id', (int) $search)
                        ->orWhere('name', 'like', '%'.$search.'%');
                });
            } else {
                $query->where('name', 'like', '%'.$search.'%');
            }
        }

        return $query->limit($limit)->get()->map(fn (File $file): array => [
            'id' => $file->id,
            'name' => $file->name,
            'mime' => $file->mime_type,
            'size' => $file->size,
            'type' => $file->type->value,
        ])->all();
    }

    /**
     * @param  list<int>  $itemIds
     * @return SupportCollection<int, array{item: CollectionItem, collection: Collection, data: array<string, mixed>}>
     */
    private function resolveItems(User $user, Request $request, array $itemIds): SupportCollection
    {
        $uniqueIds = array_values(array_unique(array_map('intval', $itemIds)));

        if ($uniqueIds === []) {
            return collect();
        }

        abort_if(
            count($uniqueIds) > self::MAX_ITEMS,
            Response::HTTP_UNPROCESSABLE_ENTITY,
            'Too many context items attached.',
        );

        abort_unless(
            $this->permissionResolver->hasPermission($user, PermissionEnum::CanShowCollections->value),
            Response::HTTP_UNPROCESSABLE_ENTITY,
            'One or more context items are not accessible.',
        );

        $items = CollectionItem::query()
            ->with(['collection.fields', 'fieldValues'])
            ->whereIn('id', $uniqueIds)
            ->get()
            ->keyBy('id');

        abort_if(
            $items->count() !== count($uniqueIds),
            Response::HTTP_UNPROCESSABLE_ENTITY,
            'One or more context items are not accessible.',
        );

        $resolved = collect();

        foreach ($uniqueIds as $itemId) {
            /** @var CollectionItem $item */
            $item = $items->get($itemId);
            $collection = $item->collection;

            abort_if(
                $collection === null
                    || ! $this->permissionEnforcer->isItemReadable($request, $collection, $item),
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'One or more context items are not accessible.',
            );

            $data = $this->permissionEnforcer->stripData(
                $request,
                $collection,
                $this->itemAssembler->assemble($item),
            );

            $resolved->push([
                'item' => $item,
                'collection' => $collection,
                'data' => $data,
            ]);
        }

        return $resolved;
    }

    /**
     * @param  list<int>  $fileIds
     * @return SupportCollection<int, File>
     */
    private function resolveFiles(User $user, array $fileIds): SupportCollection
    {
        $uniqueIds = array_values(array_unique(array_map('intval', $fileIds)));

        if ($uniqueIds === []) {
            return collect();
        }

        abort_if(
            count($uniqueIds) > self::MAX_FILES,
            Response::HTTP_UNPROCESSABLE_ENTITY,
            'Too many context files attached.',
        );

        abort_unless(
            $this->permissionResolver->hasPermission($user, PermissionEnum::CanShowFiles->value),
            Response::HTTP_UNPROCESSABLE_ENTITY,
            'One or more context files are not accessible.',
        );

        $files = File::query()
            ->whereNull('deleted_at')
            ->whereIn('id', $uniqueIds)
            ->get()
            ->keyBy('id');

        abort_if(
            $files->count() !== count($uniqueIds),
            Response::HTTP_UNPROCESSABLE_ENTITY,
            'One or more context files are not accessible.',
        );

        return collect($uniqueIds)->map(fn (int $id): File => $files->get($id));
    }

    /**
     * @param  list<int>  $promptIds
     * @return SupportCollection<int, AiPrompt>
     */
    private function resolvePrompts(array $promptIds): SupportCollection
    {
        $uniqueIds = array_values(array_unique(array_map('intval', $promptIds)));

        if ($uniqueIds === []) {
            return collect();
        }

        abort_if(
            count($uniqueIds) > self::MAX_PROMPTS,
            Response::HTTP_UNPROCESSABLE_ENTITY,
            'Too many saved prompts attached.',
        );

        $prompts = AiPrompt::query()
            ->whereIn('id', $uniqueIds)
            ->get()
            ->keyBy('id');

        abort_if(
            $prompts->count() !== count($uniqueIds),
            Response::HTTP_UNPROCESSABLE_ENTITY,
            'One or more saved prompts are not accessible.',
        );

        return collect($uniqueIds)->map(fn (int $id): AiPrompt => $prompts->get($id));
    }

    /**
     * @param  SupportCollection<int, array{item: CollectionItem, collection: Collection, data: array<string, mixed>}>  $items
     * @param  SupportCollection<int, File>  $files
     * @param  SupportCollection<int, AiPrompt>  $prompts
     */
    private function buildPromptSuffix(
        SupportCollection $items,
        SupportCollection $files,
        SupportCollection $prompts,
    ): string {
        if ($items->isEmpty() && $files->isEmpty() && $prompts->isEmpty()) {
            return '';
        }

        $sections = [];

        if ($items->isNotEmpty()) {
            $itemBlocks = $items->map(function (array $row): string {
                $payload = [
                    'item_id' => $row['item']->id,
                    'collection_id' => $row['collection']->id,
                    'collection_name' => $row['collection']->name,
                    'collection_slug' => $row['collection']->slug,
                    'data' => $row['data'],
                ];

                return json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) ?: '{}';
            })->implode("\n");

            $sections[] = "[AI_CONTEXT_ITEMS]\n{$itemBlocks}\n[/AI_CONTEXT_ITEMS]";
        }

        if ($files->isNotEmpty()) {
            $fileLines = $files->map(fn (File $file): string => sprintf(
                '- file_id=%d name="%s" mime=%s size=%s type=%s',
                $file->id,
                $file->name,
                $file->mime_type ?? 'unknown',
                $file->size ?? 'null',
                $file->type->value,
            ))->implode("\n");

            $sections[] = "[AI_CONTEXT_FILES]\n{$fileLines}\n[/AI_CONTEXT_FILES]";
        }

        if ($prompts->isNotEmpty()) {
            $promptBlocks = $prompts->map(fn (AiPrompt $prompt): string => sprintf(
                "[AI_SAVED_PROMPT id=%d name=%s]\n%s\n[/AI_SAVED_PROMPT]",
                $prompt->id,
                json_encode($prompt->name, JSON_UNESCAPED_UNICODE) ?: '"prompt"',
                $prompt->body,
            ))->implode("\n");

            $sections[] = $promptBlocks;
        }

        return "\n\n".implode("\n\n", $sections)."\n"
            .'Treat AI_CONTEXT_* blocks as explicit operator-selected context. Prefer them over guessing.';
    }

    /**
     * @param  SupportCollection<int, array{item: CollectionItem, collection: Collection, data: array<string, mixed>}>  $items
     * @param  SupportCollection<int, File>  $files
     * @param  SupportCollection<int, AiPrompt>  $prompts
     * @return list<array{type: string, id: int|string, name: string, mime?: string|null, size?: int|null, collection_id?: int, collection_name?: string}>
     */
    private function buildDisplayMeta(
        SupportCollection $items,
        SupportCollection $files,
        SupportCollection $prompts,
    ): array {
        $display = [];

        foreach ($items as $row) {
            $display[] = [
                'type' => 'ai-context-item',
                'id' => $row['item']->id,
                'name' => $this->itemLabel($row['item']->id, $row['data']),
                'collection_id' => $row['collection']->id,
                'collection_name' => $row['collection']->name,
            ];
        }

        foreach ($files as $file) {
            $display[] = [
                'type' => 'ai-context-file',
                'id' => $file->id,
                'name' => $file->name,
                'mime' => $file->mime_type,
                'size' => $file->size,
            ];
        }

        foreach ($prompts as $prompt) {
            $display[] = [
                'type' => 'ai-saved-prompt',
                'id' => $prompt->id,
                'name' => $prompt->name,
            ];
        }

        return $display;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function itemLabel(int $itemId, array $data): string
    {
        foreach (['title', 'name', 'label', 'slug'] as $key) {
            $value = $data[$key] ?? null;

            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }

            if (is_array($value)) {
                $first = reset($value);
                if (is_string($first) && trim($first) !== '') {
                    return trim($first);
                }
            }
        }

        return 'Item #'.$itemId;
    }
}

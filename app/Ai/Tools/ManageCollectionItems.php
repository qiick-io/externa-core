<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\LogsAiToolUse;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemOptionsService;
use App\Services\Collections\CollectionItemQueryService;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class ManageCollectionItems implements Tool
{
    use ChecksAiPermissions;
    use LogsAiToolUse;

    public function description(): Stringable|string
    {
        return 'List, get, create, update, soft-delete, restore, or force-delete items inside a collection. Pass field values as a JSON object in the data parameter.';
    }

    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            $action = (string) $request->string('action');

            return match ($action) {
                'list' => $this->listItems($request),
                'get' => $this->getItem($request->integer('item_id')),
                'create' => $this->createItem($request),
                'update' => $this->updateItem($request),
                'delete' => $this->deleteItem($request->integer('item_id')),
                'restore' => $this->restoreItem($request->integer('item_id')),
                'force_delete' => $this->forceDeleteItem($request->integer('item_id')),
                'bulk_update' => $this->bulkUpdate($request),
                'bulk_delete' => $this->bulkDelete($request),
                'list_relation_options' => $this->listRelationOptions($request),
                default => 'Error: Unknown action. Use list, get, create, update, delete, restore, force_delete, bulk_update, bulk_delete, or list_relation_options.',
            };
        });
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'action' => $schema->string()->required()->description('list|get|create|update|delete|restore|force_delete|bulk_update|bulk_delete|list_relation_options'),
            'collection_id' => $schema->integer(),
            'item_id' => $schema->integer(),
            'field_id' => $schema->integer()->description('Relation field id for list_relation_options'),
            'data_json' => $schema->string()->description('JSON object of field values, e.g. {"title":"Hello"}'),
            'filter_field' => $schema->string(),
            'filter_value' => $schema->string(),
            'search' => $schema->string()->description('Optional relation option search'),
            'trashed' => $schema->boolean()->description('For list, return only soft-deleted items'),
            'limit' => $schema->integer(),
        ];
    }

    private function listItems(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanShowCollections)) {
            return $error;
        }

        $collectionId = $request->integer('collection_id');
        $collection = Collection::query()->find($collectionId);

        if ($collection === null) {
            return 'Error: Collection not found.';
        }

        $limit = min(max($request->integer('limit', 25), 1), 100);
        $assembler = app(CollectionItemValuesAssembler::class);

        $items = $collection->items()
            ->when($request->boolean('trashed'), fn ($query) => $query->onlyTrashed())
            ->latest('id')
            ->limit($limit)
            ->get()
            ->map(fn (CollectionItem $item): array => [
                'id' => $item->id,
                'collection_id' => $item->collection_id,
                'deleted_at' => $item->deleted_at,
                'data' => $assembler->assemble($item),
            ]);

        return json_encode(['items' => $items], JSON_PRETTY_PRINT) ?: '[]';
    }

    private function getItem(int $itemId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanShowCollections)) {
            return $error;
        }

        $item = CollectionItem::query()->with('collection.fields')->find($itemId);

        if ($item === null) {
            return 'Error: Item not found.';
        }

        return json_encode([
            'id' => $item->id,
            'collection_id' => $item->collection_id,
            'data' => app(CollectionItemValuesAssembler::class)->assemble($item),
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function createItem(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanCreateCollections)) {
            return $error;
        }

        $collection = Collection::query()->with('fields')->find($request->integer('collection_id'));

        if ($collection === null) {
            return 'Error: Collection not found.';
        }

        if ($collection->is_singleton && $collection->items()->exists()) {
            return 'Error: Singleton collection already has its content item. Use update instead.';
        }

        $data = $this->decodeData($request);

        if (is_string($data)) {
            return $data;
        }

        $normalized = app(CollectionItemDataNormalizer::class)->normalize($collection, $data, true);
        $item = $collection->items()->create([]);
        app(CollectionItemValuesWriter::class)->sync($item, $collection, $normalized);
        $this->logAiMutation($item, 'create_item');

        return json_encode([
            'ok' => true,
            'item' => [
                'id' => $item->id,
                'collection_id' => $item->collection_id,
                'data' => app(CollectionItemValuesAssembler::class)->assemble($item->fresh()),
            ],
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function updateItem(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanEditCollections)) {
            return $error;
        }

        $item = CollectionItem::query()->with('collection.fields')->find($request->integer('item_id'));

        if ($item === null) {
            return 'Error: Item not found.';
        }

        $incoming = $this->decodeData($request);

        if (is_string($incoming)) {
            return $incoming;
        }

        $data = $this->patchItem($item, $incoming);
        $this->logAiMutation($item, 'update_item');

        return json_encode([
            'ok' => true,
            'item' => [
                'id' => $item->id,
                'collection_id' => $item->collection_id,
                'data' => $data,
            ],
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function bulkUpdate(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanEditCollections)) {
            return $error;
        }

        $collection = Collection::query()->with('fields')->find($request->integer('collection_id'));
        $incoming = $this->decodeData($request);

        if ($collection === null) {
            return 'Error: Collection not found.';
        }

        if (is_string($incoming)) {
            return $incoming;
        }

        $items = $this->filteredItems($request, $collection);

        if (is_string($items)) {
            return $items;
        }

        foreach ($items as $item) {
            $this->patchItem($item->load('collection.fields'), $incoming);
            $this->logAiMutation($item, 'bulk_update_item');
        }

        return json_encode(['ok' => true, 'updated' => $items->count()], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function bulkDelete(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanDeleteCollections)) {
            return $error;
        }

        $collection = Collection::query()->with('fields')->find($request->integer('collection_id'));

        if ($collection === null) {
            return 'Error: Collection not found.';
        }

        $items = $this->filteredItems($request, $collection);

        if (is_string($items)) {
            return $items;
        }

        foreach ($items as $item) {
            $this->logAiMutation($item, 'bulk_delete_item');
            $item->delete();
        }

        return json_encode(['ok' => true, 'deleted' => $items->count()], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function listRelationOptions(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanShowCollections)) {
            return $error;
        }

        $field = CollectionField::query()->find($request->integer('field_id'));

        if ($field === null || ! $field->type->isRelationType()) {
            return 'Error: Relation field not found.';
        }

        $limit = min(max($request->integer('limit', 20), 1), 100);
        $paginator = app(CollectionItemOptionsService::class)->paginateForField(
            $field,
            trim((string) $request->string('search')) ?: null,
            $limit,
        );

        return json_encode([
            'field_id' => $field->id,
            'options' => $paginator->items(),
            'total' => $paginator->total(),
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
    }

    private function deleteItem(int $itemId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanDeleteCollections)) {
            return $error;
        }

        $item = CollectionItem::query()->find($itemId);

        if ($item === null) {
            return 'Error: Item not found.';
        }

        $summary = ['id' => $item->id, 'collection_id' => $item->collection_id];
        $this->logAiMutation($item, 'delete_item');
        $item->delete();

        return json_encode(['ok' => true, 'deleted' => $summary], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function restoreItem(int $itemId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanRestoreCollections)) {
            return $error;
        }

        $item = CollectionItem::query()->onlyTrashed()->find($itemId);

        if ($item === null) {
            return 'Error: Trashed item not found.';
        }

        $item->restore();
        $this->logAiMutation($item, 'restore_item');

        return json_encode([
            'ok' => true,
            'item' => $item->only(['id', 'collection_id', 'deleted_at']),
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function forceDeleteItem(int $itemId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanForceDeleteCollections)) {
            return $error;
        }

        $item = CollectionItem::query()->withTrashed()->find($itemId);

        if ($item === null) {
            return 'Error: Item not found.';
        }

        $summary = $item->only(['id', 'collection_id']);
        $this->logAiMutation($item, 'force_delete_item');
        $item->forceDelete();

        return json_encode(['ok' => true, 'force_deleted' => $summary], JSON_PRETTY_PRINT) ?: '{}';
    }

    /**
     * @return EloquentCollection<int, CollectionItem>|string
     */
    private function filteredItems(Request $request, Collection $collection): EloquentCollection|string
    {
        $filterField = trim((string) $request->string('filter_field'));
        $filterValue = trim((string) $request->string('filter_value'));

        if ($filterField === '' || $filterValue === '') {
            return 'Error: filter_field and filter_value are required.';
        }

        if (! $collection->fields->contains('name', $filterField)) {
            return 'Error: Filter field not found.';
        }

        $query = $collection->items()->getQuery();
        app(CollectionItemQueryService::class)->applyFilters(
            $query,
            $collection,
            [$filterField => $filterValue],
        );

        return $query->oldest('id')->limit(min(max($request->integer('limit', 100), 1), 100))->get();
    }

    /**
     * @param  array<string, mixed>  $incoming
     * @return array<string, mixed>
     */
    private function patchItem(CollectionItem $item, array $incoming): array
    {
        $collection = $item->collection;
        $assembler = app(CollectionItemValuesAssembler::class);
        $data = $assembler->assemble($item);

        foreach ($collection->fields as $field) {
            if (method_exists($field, 'isReadonly') && $field->isReadonly()) {
                unset($incoming[$field->name]);
            }
        }

        foreach ($incoming as $key => $value) {
            $data[$key] = is_array($value) && isset($data[$key]) && is_array($data[$key])
                ? array_merge($data[$key], $value)
                : $value;
        }

        $normalized = app(CollectionItemDataNormalizer::class)->normalize($collection, $data, false);
        app(CollectionItemValuesWriter::class)->sync($item->fresh(), $collection, $normalized);

        return $assembler->assemble($item->fresh());
    }

    /**
     * @return array<string, mixed>|string
     */
    private function decodeData(Request $request): array|string
    {
        $raw = trim((string) $request->string('data_json'));

        if ($raw === '') {
            return [];
        }

        $decoded = json_decode($raw, true);

        if (! is_array($decoded)) {
            return 'Error: data_json must be a valid JSON object.';
        }

        return $decoded;
    }
}

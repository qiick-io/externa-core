<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\LogsAiToolUse;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class ManageCollectionItems implements Tool
{
    use ChecksAiPermissions;
    use LogsAiToolUse;

    public function description(): Stringable|string
    {
        return 'List, get, create, update, or delete items inside a collection. Pass field values as a JSON object in the data parameter.';
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
                default => 'Error: Unknown action. Use list, get, create, update, or delete.',
            };
        });
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'action' => $schema->string()->required(),
            'collection_id' => $schema->integer(),
            'item_id' => $schema->integer(),
            'data_json' => $schema->string()->description('JSON object of field values, e.g. {"title":"Hello"}'),
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
            ->latest('id')
            ->limit($limit)
            ->get()
            ->map(fn (CollectionItem $item): array => [
                'id' => $item->id,
                'collection_id' => $item->collection_id,
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

        $collection = $item->collection;
        $incoming = $this->decodeData($request);

        if (is_string($incoming)) {
            return $incoming;
        }

        $assembler = app(CollectionItemValuesAssembler::class);
        $data = $assembler->assemble($item);

        foreach ($collection->fields as $field) {
            if (method_exists($field, 'isReadonly') && $field->isReadonly()) {
                unset($incoming[$field->name]);
            }
        }

        foreach ($incoming as $key => $value) {
            if (is_array($value) && isset($data[$key]) && is_array($data[$key])) {
                $data[$key] = array_merge($data[$key], $value);
            } else {
                $data[$key] = $value;
            }
        }

        $normalized = app(CollectionItemDataNormalizer::class)->normalize($collection, $data, false);
        app(CollectionItemValuesWriter::class)->sync($item->fresh(), $collection, $normalized);
        $this->logAiMutation($item, 'update_item');

        return json_encode([
            'ok' => true,
            'item' => [
                'id' => $item->id,
                'collection_id' => $item->collection_id,
                'data' => $assembler->assemble($item->fresh()),
            ],
        ], JSON_PRETTY_PRINT) ?: '{}';
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

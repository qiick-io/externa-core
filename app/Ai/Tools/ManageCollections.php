<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\LogsAiToolUse;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Str;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class ManageCollections implements Tool
{
    use ChecksAiPermissions;
    use LogsAiToolUse;

    public function description(): Stringable|string
    {
        return 'List, get, create, update, or delete content collections.';
    }

    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            $action = (string) $request->string('action');

            return match ($action) {
                'list' => $this->listCollections(),
                'get' => $this->getCollection($request->integer('collection_id')),
                'create' => $this->createCollection($request),
                'update' => $this->updateCollection($request),
                'delete' => $this->deleteCollection($request->integer('collection_id')),
                default => 'Error: Unknown action. Use list, get, create, update, or delete.',
            };
        });
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'action' => $schema->string()->required(),
            'collection_id' => $schema->integer(),
            'name' => $schema->string(),
            'slug' => $schema->string(),
            'is_singleton' => $schema->boolean(),
        ];
    }

    private function listCollections(): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanShowCollections)) {
            return $error;
        }

        $collections = Collection::query()
            ->ordered()
            ->limit(100)
            ->get(['id', 'name', 'slug', 'is_singleton', 'sort_order']);

        return json_encode(['collections' => $collections], JSON_PRETTY_PRINT) ?: '[]';
    }

    private function getCollection(int $collectionId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanShowCollections)) {
            return $error;
        }

        $collection = Collection::query()
            ->with(['fields' => fn ($query) => $query->ordered()])
            ->withCount('items')
            ->find($collectionId);

        if ($collection === null) {
            return 'Error: Collection not found.';
        }

        return json_encode([
            'id' => $collection->id,
            'name' => $collection->name,
            'slug' => $collection->slug,
            'is_singleton' => $collection->is_singleton,
            'items_count' => $collection->items_count,
            'fields' => $collection->fields->map(fn ($field): array => [
                'id' => $field->id,
                'name' => $field->name,
                'type' => $field->type?->value ?? $field->type,
            ])->values(),
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function createCollection(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanCreateCollections)) {
            return $error;
        }

        $name = trim((string) $request->string('name'));

        if ($name === '') {
            return 'Error: name is required.';
        }

        $slug = trim((string) $request->string('slug'));
        if ($slug === '') {
            $slug = Str::slug($name);
        }

        $collection = Collection::query()->create([
            'name' => $name,
            'slug' => $slug,
            'is_singleton' => (bool) $request->boolean('is_singleton'),
        ]);

        if ($collection->is_singleton) {
            $collection->items()->create([]);
        }

        $this->logAiMutation($collection, 'create_collection');

        return json_encode([
            'ok' => true,
            'collection' => $collection->only(['id', 'name', 'slug', 'is_singleton']),
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function updateCollection(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanEditCollections)) {
            return $error;
        }

        $collection = Collection::query()->find($request->integer('collection_id'));

        if ($collection === null) {
            return 'Error: Collection not found.';
        }

        $attributes = [];

        if ($request->filled('name')) {
            $attributes['name'] = trim((string) $request->string('name'));
        }

        if ($request->filled('slug')) {
            $attributes['slug'] = trim((string) $request->string('slug'));
        }

        if ($request->has('is_singleton')) {
            $attributes['is_singleton'] = (bool) $request->boolean('is_singleton');
        }

        if ($attributes === []) {
            return 'Error: Provide name, slug, and/or is_singleton to update.';
        }

        $collection->update($attributes);
        $this->logAiMutation($collection, 'update_collection');

        return json_encode([
            'ok' => true,
            'collection' => $collection->fresh()->only(['id', 'name', 'slug', 'is_singleton']),
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function deleteCollection(int $collectionId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanDeleteCollections)) {
            return $error;
        }

        $collection = Collection::query()->find($collectionId);

        if ($collection === null) {
            return 'Error: Collection not found.';
        }

        $summary = $collection->only(['id', 'name', 'slug']);
        $this->logAiMutation($collection, 'delete_collection');
        $collection->delete();

        return json_encode(['ok' => true, 'deleted' => $summary], JSON_PRETTY_PRINT) ?: '{}';
    }
}

<?php

namespace App\Ai\Tools;

use App\Actions\Collections\CreateCollectionFieldAction;
use App\Actions\Collections\CreateCollectionItemAction;
use App\Actions\Collections\CreateContentCollectionAction;
use App\Actions\Collections\ReorderCollectionFieldsAction;
use App\Actions\Collections\UpdateCollectionFieldAction;
use App\Ai\Concerns\ChecksAiPermissionsTrait;
use App\Ai\Concerns\EnforcesAiCollectionPermissionsTrait;
use App\Ai\Concerns\LogsAiToolUseTrait;
use App\Ai\Concerns\RequiresDestructiveApprovalTrait;
use App\Contracts\Ai\ClassifiesToolActionsContract;
use App\Data\Api\ApiAccessData;
use App\Data\Collections\CollectionItemWriteData;
use App\Data\Collections\FieldConvertOptionsData;
use App\Enums\ApiKeyScopeEnum;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Http\Requests\Collections\ReorderFieldsRequest;
use App\Http\Requests\Collections\StoreContentCollectionRequest;
use App\Http\Requests\Collections\StoreFieldRequest;
use App\Http\Requests\Collections\UpdateFieldRequest;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Services\Collections\ApplyCollectionPackService;
use App\Services\Collections\ApplyFieldPackService;
use App\Services\Collections\CollectionFieldConvertService;
use App\Services\Collections\CollectionItemValuesAssemblerService;
use App\Services\Collections\CollectionPacks\CollectionPackRegistryService;
use App\Services\Collections\FieldPacks\FieldPackRegistryService;
use App\Traits\ValidatesAiInputWithFormRequestTrait;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Laravel\Ai\Contracts\Approvable;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * AI tool for listing and mutating content collections and their settings.
 *
 * Creating a collection and creating, updating and reordering fields run on the collection
 * builder's own FormRequests and Actions, so the AI gets exactly the UI's validation (#766).
 * Under an API key (MCP) only those four schema changes are available, and each also needs
 * the key's own grants ({@see guardApiKeySchemaChange()}), not just its owner's.
 */
class ManageCollections implements Approvable, ClassifiesToolActionsContract, Tool
{
    use ChecksAiPermissionsTrait;
    use EnforcesAiCollectionPermissionsTrait;
    use LogsAiToolUseTrait;
    use RequiresDestructiveApprovalTrait;
    use ValidatesAiInputWithFormRequestTrait;

    /**
     * Mutating actions an API key may call: the schema tools exposed over MCP.
     *
     * @var list<string>
     */
    private const array API_KEY_SCHEMA_ACTIONS = ['create', 'create_field', 'update_field', 'reorder_fields'];

    /**
     * @return list<string>
     */
    protected function writeActions(): array
    {
        return [
            'create',
            'update',
            'restore',
            'create_field',
            'update_field',
            'reorder_fields',
            'convert_field',
            'apply_field_pack',
            'apply_collection_pack',
            'duplicate',
        ];
    }

    /**
     * @return list<string>
     */
    protected function destructiveActions(): array
    {
        return ['delete', 'force_delete', 'delete_field'];
    }

    /**
     * Describe what this tool does for the model.
     */
    public function description(): Stringable|string
    {
        return 'List, get, create, update, soft-delete, restore, or force-delete content collections; create/update/reorder/delete/convert fields (convert_field migrates stored values for safe type pairs); list or apply field packs and collection packs (e.g. SEO entity, Articles).';
    }

    /**
     * Execute the tool request and return a string result for the model.
     */
    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            if (($refusal = $this->writeActionRefusal($request)) !== null) {
                return $refusal;
            }

            $action = (string) $request->string('action');

            if ($this->apiAccess() !== null
                && $this->kindOfAction($action)->isMutating()
                && ! in_array($action, self::API_KEY_SCHEMA_ACTIONS, true)) {
                return 'Error: '.$action.' is not available with an API key.';
            }

            return match ($action) {
                'list' => $this->listCollections($request),
                'get' => $this->getCollection($request->integer('collection_id')),
                'create' => $this->createCollection($request),
                'update' => $this->updateCollection($request),
                'delete' => $this->deleteCollection($request->integer('collection_id')),
                'restore' => $this->restoreCollection($request->integer('collection_id')),
                'force_delete' => $this->forceDeleteCollection($request->integer('collection_id')),
                'create_field' => $this->createField($request),
                'update_field' => $this->updateField($request),
                'reorder_fields' => $this->reorderFields($request),
                'convert_field' => $this->convertField($request),
                'delete_field' => $this->deleteField($request),
                'list_field_packs' => $this->listFieldPacks(),
                'apply_field_pack' => $this->applyFieldPack($request),
                'list_collection_packs' => $this->listCollectionPacks(),
                'apply_collection_pack' => $this->applyCollectionPack($request),
                'duplicate' => $this->duplicateCollection($request),
                default => 'Error: Unknown action. Use list, get, create, update, delete, restore, force_delete, create_field, update_field, reorder_fields, convert_field, delete_field, list_field_packs, apply_field_pack, list_collection_packs, apply_collection_pack, or duplicate.',
            };
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'action' => $schema->string()->required()->description(
                'list|get|create|update|delete|restore|force_delete|create_field|update_field|reorder_fields|convert_field|delete_field|list_field_packs|apply_field_pack|list_collection_packs|apply_collection_pack|duplicate'
            ),
            'collection_id' => $schema->integer(),
            'trashed' => $schema->boolean()->description('For list, return only soft-deleted collections'),
            'field_id' => $schema->integer(),
            'name' => $schema->string()->description('Collection name, or field name for *_field actions; optional override for apply_collection_pack'),
            'slug' => $schema->string()->description('Collection slug; optional override for apply_collection_pack'),
            'is_singleton' => $schema->boolean(),
            'type' => $schema->string()->description('Field type enum value, e.g. string, textarea, boolean'),
            'translatable' => $schema->boolean(),
            'locale' => $schema->string()->description('For convert_field when collapsing translatable → non-translatable: locale to keep'),
            'dry_run' => $schema->boolean()->description('For convert_field: preview without writing'),
            'settings_json' => $schema->string()->description('Optional JSON object for field settings (required, validation, relations, …); call DescribeFieldTypes for the keys of each type'),
            'field_ids' => $schema->array()->items($schema->integer())->description('For reorder_fields: every field id of the collection, in the new order'),
            'pack' => $schema->string()->description('Pack key for apply_field_pack (e.g. seo_inline, publishing) or apply_collection_pack (e.g. seo, articles). Call list_*_packs first if unsure.'),
            'with_sample' => $schema->boolean()->description('For duplicate, copy up to five sample items'),
        ];
    }

    private function listCollections(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanShowCollections)) {
            return $error;
        }

        $collections = Collection::query()
            ->when($request->boolean('trashed'), fn ($query) => $query->onlyTrashed())
            ->with(['fields' => fn ($query) => $query->ordered()->select(['id', 'collection_id', 'name', 'type'])])
            ->ordered()
            ->limit(100)
            ->get(['id', 'name', 'slug', 'is_singleton', 'sort_order', 'deleted_at']);

        return json_encode([
            'collections' => $collections->filter(
                fn (Collection $collection): bool => $this->isAiCollectionReadable($collection),
            )->map(fn (Collection $collection): array => [
                'id' => $collection->id,
                'name' => $collection->name,
                'slug' => $collection->slug,
                'is_singleton' => $collection->is_singleton,
                'sort_order' => $collection->sort_order,
                'deleted_at' => $collection->deleted_at,
                'fields' => $this->readableAiFields($collection)->map(fn (CollectionField $field): array => [
                    'id' => $field->id,
                    'name' => $field->name,
                    'type' => $field->type instanceof FieldTypeEnum ? $field->type->value : (string) $field->type,
                ])->values()->all(),
            ])->values()->all(),
        ], JSON_PRETTY_PRINT) ?: '[]';
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

        if ($collection === null || ! $this->isAiCollectionReadable($collection)) {
            return 'Error: Collection not found.';
        }

        return json_encode([
            'id' => $collection->id,
            'name' => $collection->name,
            'slug' => $collection->slug,
            'url' => route('collections.show', $collection),
            'is_singleton' => $collection->is_singleton,
            'items_count' => $collection->items_count,
            'fields' => $this->readableAiFields($collection)->map(fn ($field): array => [
                'id' => $field->id,
                'name' => $field->name,
                'type' => $field->type?->value ?? $field->type,
                'translatable' => (bool) $field->translatable,
                'settings' => $field->settings,
            ])->values(),
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    /**
     * Create a collection through the collection builder's request and action (a singleton
     * gets its single item). Localisation is per field (`translatable` on create_field).
     */
    private function createCollection(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanCreateCollections)) {
            return $error;
        }

        $input = array_filter([
            'name' => $request->string('name')->trim()->toString(),
            'slug' => $request->string('slug')->trim()->toString(),
        ], static fn (string $value): bool => $value !== '');

        if ($request->has('is_singleton')) {
            $input['is_singleton'] = $request->boolean('is_singleton');
        }

        $slugForScope = Str::slug((string) ($input['slug'] ?? $input['name'] ?? ''));

        if ($error = $this->guardApiKeySchemaChange(PermissionEnum::CanCreateCollections, $slugForScope)) {
            return $error;
        }

        $validated = $this->validateWithFormRequest(StoreContentCollectionRequest::class, $input);

        if (is_string($validated)) {
            return $validated;
        }

        $collection = app(CreateContentCollectionAction::class)->execute($validated);
        $this->logAiMutation($collection, 'create_collection');

        return json_encode([
            'ok' => true,
            'created' => true,
            'url' => route('collections.show', $collection),
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

    private function restoreCollection(int $collectionId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanRestoreCollections)) {
            return $error;
        }

        $collection = Collection::query()->onlyTrashed()->find($collectionId);

        if ($collection === null) {
            return 'Error: Trashed collection not found.';
        }

        $collection->restore();
        $this->logAiMutation($collection, 'restore_collection');

        return json_encode([
            'ok' => true,
            'collection' => $collection->only(['id', 'name', 'slug', 'deleted_at']),
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function forceDeleteCollection(int $collectionId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanForceDeleteCollections)) {
            return $error;
        }

        $collection = Collection::query()->withTrashed()->find($collectionId);

        if ($collection === null) {
            return 'Error: Collection not found.';
        }

        $summary = $collection->only(['id', 'name', 'slug']);
        $this->logAiMutation($collection, 'force_delete_collection');
        $collection->forceDelete();

        return json_encode(['ok' => true, 'force_deleted' => $summary], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function duplicateCollection(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanCreateCollections)) {
            return $error;
        }

        $source = Collection::query()->with('fields')->find($request->integer('collection_id'));

        if ($source === null) {
            return 'Error: Collection not found.';
        }

        $payload = DB::transaction(function () use ($request, $source): array {
            $name = $source->name.' Copy';
            $baseSlug = Str::slug($name);
            $slug = $baseSlug;
            $suffix = 2;

            while (Collection::query()->withTrashed()->where('slug', $slug)->lockForUpdate()->exists()) {
                $slug = $baseSlug.'-'.$suffix;
                $suffix++;
            }

            $duplicate = Collection::query()->create([
                'name' => $name,
                'slug' => $slug,
                'is_singleton' => $source->is_singleton,
            ]);

            foreach ($source->fields as $field) {
                $duplicate->fields()->create([
                    'name' => $field->name,
                    'type' => $field->type,
                    'translatable' => $field->translatable,
                    'settings' => $field->settings,
                    'sort_order' => $field->sort_order,
                ]);
            }

            $sampleCount = 0;

            if ($request->boolean('with_sample')) {
                $duplicate->load('fields');
                $assembler = app(CollectionItemValuesAssemblerService::class);
                $createAction = app(CreateCollectionItemAction::class);

                foreach ($source->items()->oldest('id')->limit(5)->get() as $sourceItem) {
                    /** @var CollectionItem $sourceItem */
                    $createAction->execute(new CollectionItemWriteData(
                        collection: $duplicate,
                        data: $assembler->assemble($sourceItem),
                        creating: true,
                        shouldValidate: false,
                    ));
                    $sampleCount++;
                }
            }

            $this->logAiMutation($duplicate, 'duplicate_collection');

            return [
                'ok' => true,
                'collection' => $duplicate->only(['id', 'name', 'slug', 'is_singleton']),
                'fields_copied' => $source->fields->count(),
                'sample_items_copied' => $sampleCount,
            ];
        });

        return json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
    }

    private function listFieldPacks(): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanShowCollections)) {
            return $error;
        }

        return json_encode([
            'packs' => FieldPackRegistryService::summaries(),
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
    }

    private function applyFieldPack(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanEditCollections)) {
            return $error;
        }

        $collection = Collection::query()->find($request->integer('collection_id'));

        if ($collection === null) {
            return 'Error: Collection not found.';
        }

        $packKey = trim((string) $request->string('pack'));

        if ($packKey === '') {
            return 'Error: pack is required (e.g. seo_inline). Call list_field_packs to see available keys.';
        }

        try {
            $result = app(ApplyFieldPackService::class)->apply($collection, $packKey);
        } catch (InvalidArgumentException $exception) {
            return 'Error: '.$exception->getMessage();
        }

        $this->logAiMutation($collection, 'apply_field_pack');

        return json_encode([
            'ok' => true,
            ...$result,
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
    }

    private function listCollectionPacks(): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanShowCollections)) {
            return $error;
        }

        return json_encode([
            'packs' => CollectionPackRegistryService::summaries(),
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
    }

    private function applyCollectionPack(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanCreateCollections)) {
            return $error;
        }

        $packKey = trim((string) $request->string('pack'));

        if ($packKey === '') {
            return 'Error: pack is required (e.g. seo, articles). Call list_collection_packs to see available keys.';
        }

        $overrides = [];
        $name = trim((string) $request->string('name'));
        $slug = trim((string) $request->string('slug'));
        if ($name !== '') {
            $overrides['name'] = $name;
        }
        if ($slug !== '') {
            $overrides['slug'] = $slug;
        }

        try {
            $result = app(ApplyCollectionPackService::class)->apply($packKey, $overrides);
        } catch (InvalidArgumentException $exception) {
            return 'Error: '.$exception->getMessage();
        }

        $collection = Collection::query()->find($result['collection']['id']);
        if ($collection instanceof Collection) {
            $this->logAiMutation($collection, 'apply_collection_pack');
        }

        return json_encode([
            'ok' => true,
            ...$result,
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
    }

    /**
     * Add a field through the field builder's request and action.
     */
    private function createField(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanEditCollections)) {
            return $error;
        }

        $collection = Collection::query()->find($request->integer('collection_id'));

        if ($collection === null) {
            return 'Error: Collection not found.';
        }

        if ($error = $this->guardApiKeySchemaChange(PermissionEnum::CanEditCollections, (string) $collection->slug)) {
            return $error;
        }

        $input = $this->fieldInput($request);
        $validated = $this->validateWithFormRequest(
            StoreFieldRequest::class,
            $input,
            ['collection' => $collection],
            ['settings' => 'settings_json'],
        );

        if (is_string($validated)) {
            return $validated;
        }

        $field = app(CreateCollectionFieldAction::class)->execute($collection, $validated, $request->boolean('translatable'));
        $this->logAiMutation($field, 'create_field');

        return json_encode(['ok' => true, 'field' => $this->fieldPayload($field)], JSON_PRETTY_PRINT) ?: '{}';
    }

    /**
     * Update a field's name, type, per-locale flag or settings through the field builder's
     * request and action (stored values follow a rename; a type change on a field with
     * content is refused, as in the UI).
     */
    private function updateField(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanEditCollections)) {
            return $error;
        }

        $field = $this->findField($request);

        if (is_string($field)) {
            return $field;
        }

        $collection = $field->collection;

        if ($collection === null) {
            return 'Error: Collection not found for field.';
        }

        if ($error = $this->guardApiKeySchemaChange(PermissionEnum::CanEditCollections, (string) $collection->slug)) {
            return $error;
        }

        $input = $this->fieldInput($request);

        if ($input === []) {
            return 'Error: Provide name, type, translatable, and/or settings_json to update.';
        }

        $validated = $this->validateWithFormRequest(
            UpdateFieldRequest::class,
            $input,
            ['collection' => $collection, 'field' => $field],
            ['settings' => 'settings_json'],
        );

        if (is_string($validated)) {
            return $validated;
        }

        app(UpdateCollectionFieldAction::class)->execute(
            $collection,
            $field,
            $validated,
            $request->has('translatable') ? $request->boolean('translatable') : null,
        );

        $field = $field->fresh() ?? $field;
        $this->logAiMutation($field, 'update_field');

        return json_encode(['ok' => true, 'field' => $this->fieldPayload($field)], JSON_PRETTY_PRINT) ?: '{}';
    }

    /**
     * Put a collection's fields in a new order through the field builder's request and action.
     * Row breaks and group nesting are left as they are.
     */
    private function reorderFields(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanEditCollections)) {
            return $error;
        }

        $collection = Collection::query()->with('fields')->find($request->integer('collection_id'));

        if ($collection === null) {
            return 'Error: Collection not found.';
        }

        if ($error = $this->guardApiKeySchemaChange(PermissionEnum::CanEditCollections, (string) $collection->slug)) {
            return $error;
        }

        $fieldIds = array_values(array_map(intval(...), (array) $request->array('field_ids')));
        $collectionFieldIds = $collection->fields->pluck('id')->map(intval(...))->all();

        // The action writes sort_order by position, so a partial or foreign list would
        // interleave fields; the whole set, exactly once each, is the only safe input.
        if ($fieldIds === [] || count($fieldIds) !== count($collectionFieldIds) || array_diff($collectionFieldIds, $fieldIds) !== []) {
            return 'Error: field_ids must list every field id of the collection exactly once.';
        }

        $validated = $this->validateWithFormRequest(ReorderFieldsRequest::class, ['ids' => $fieldIds], [], ['ids' => 'field_ids']);

        if (is_string($validated)) {
            return $validated;
        }

        $startsNewRowIds = array_values($collection->fields
            ->filter(static fn (CollectionField $field): bool => (bool) ($field->settings['layout_starts_new_row'] ?? false))
            ->pluck('id')
            ->map(intval(...))
            ->all());

        app(ReorderCollectionFieldsAction::class)->execute($collection, $fieldIds, $startsNewRowIds, []);
        $this->logAiMutation($collection, 'reorder_fields');

        return json_encode([
            'ok' => true,
            'fields' => $collection->fields()->ordered()->get()
                ->map(fn (CollectionField $field): array => $this->fieldPayload($field))
                ->values()
                ->all(),
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    /**
     * The field request input from the tool arguments; `settings_json` goes in as the
     * `settings` string the field requests decode themselves.
     *
     * @return array<string, mixed>
     */
    private function fieldInput(Request $request): array
    {
        $input = array_filter([
            'name' => $request->string('name')->trim()->toString(),
            'type' => $request->string('type')->trim()->toString(),
            'settings' => $request->string('settings_json')->trim()->toString(),
        ], static fn (string $value): bool => $value !== '');

        if ($request->has('translatable')) {
            $input['translatable'] = $request->boolean('translatable');
        }

        return $input;
    }

    /**
     * @return array{id: int, collection_id: int, name: string, type: string, translatable: bool, sort_order: int|null, settings: mixed}
     */
    private function fieldPayload(CollectionField $field): array
    {
        return [
            'id' => (int) $field->id,
            'collection_id' => (int) $field->collection_id,
            'name' => (string) $field->name,
            'type' => $field->type instanceof FieldTypeEnum ? $field->type->value : (string) $field->type,
            'translatable' => (bool) $field->translatable,
            'sort_order' => $field->sort_order !== null ? (int) $field->sort_order : null,
            'settings' => $field->settings,
        ];
    }

    /**
     * Under an API key, a schema change needs the key's own grants as well as its owner's
     * (which {@see requirePermission()} checked): the `collections:write` scope, the
     * permission on the key's role, and the collection inside the key's `collection_slugs`.
     * A key is a narrower credential than its owner, never the owner's full authority.
     * Session users (the in-app assistant) return null.
     */
    private function guardApiKeySchemaChange(PermissionEnum $permission, string $collectionSlug): ?string
    {
        $access = $this->apiAccess();

        if ($access === null) {
            return null;
        }

        $apiKey = $access->apiKey;

        if ($apiKey === null || ! $apiKey->hasScope(ApiKeyScopeEnum::CollectionsWrite)) {
            return 'Error: The API key lacks the collections:write scope.';
        }

        if (! $access->role->permissions->contains('name', $permission->value)) {
            return 'Error: The API key role lacks the '.$permission->value.' permission.';
        }

        if (! $apiKey->allowsCollectionSlug($collectionSlug)) {
            return 'Error: The collection is outside the API key collection list.';
        }

        return null;
    }

    private function apiAccess(): ?ApiAccessData
    {
        $access = request()->attributes->get('apiAccess');

        return $access instanceof ApiAccessData ? $access : null;
    }

    /**
     * Convert a field type / translatable flag and migrate stored values (#220).
     */
    private function convertField(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanEditCollections)) {
            return $error;
        }

        $field = $this->findField($request);

        if (is_string($field)) {
            return $field;
        }

        $typeRaw = trim((string) $request->string('type'));
        $toType = $typeRaw !== ''
            ? FieldTypeEnum::tryFrom($typeRaw)
            : $field->type;

        if ($toType === null) {
            return 'Error: Invalid field type. Use one of: '.implode(', ', FieldTypeEnum::values()).'.';
        }

        $toTranslatable = $request->has('translatable')
            ? (bool) $request->boolean('translatable')
            : (bool) $field->translatable;

        $locale = $request->filled('locale') ? trim((string) $request->string('locale')) : null;
        $dryRun = (bool) $request->boolean('dry_run');

        $settings = null;
        if ($request->filled('settings_json')) {
            $decoded = $this->decodeSettings($request);
            if (is_string($decoded)) {
                return $decoded;
            }
            $settings = $decoded;
        }

        $result = app(CollectionFieldConvertService::class)->run($field, new FieldConvertOptionsData(
            toType: $toType,
            toTranslatable: $toTranslatable,
            locale: $locale,
            settings: $settings,
            dryRun: $dryRun,
        ));

        if (! $result->supported || $result->error !== null) {
            return 'Error: '.($result->error ?? 'Unsupported conversion.');
        }

        if ($result->applied) {
            $this->logAiMutation($field->fresh() ?? $field, 'convert_field');
        }

        return json_encode([
            'ok' => true,
            'convert' => $result->toArray(),
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function deleteField(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanEditCollections)) {
            return $error;
        }

        $field = $this->findField($request);

        if (is_string($field)) {
            return $field;
        }

        $summary = [
            'id' => $field->id,
            'collection_id' => $field->collection_id,
            'name' => $field->name,
            'type' => $field->type->value,
        ];
        $this->logAiMutation($field, 'delete_field');
        $field->delete();

        return json_encode(['ok' => true, 'deleted' => $summary], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function findField(Request $request): CollectionField|string
    {
        $fieldId = $request->integer('field_id');

        if ($fieldId < 1) {
            return 'Error: field_id is required.';
        }

        $field = CollectionField::query()->find($fieldId);

        if ($field === null) {
            return 'Error: Field not found.';
        }

        if ($request->filled('collection_id') && $field->collection_id !== $request->integer('collection_id')) {
            return 'Error: Field does not belong to the given collection.';
        }

        return $field;
    }

    /**
     * @return array<string, mixed>|null|string
     */
    private function decodeSettings(Request $request): array|string|null
    {
        if (! $request->filled('settings_json')) {
            return null;
        }

        $raw = trim((string) $request->string('settings_json'));

        if ($raw === '' || $raw === 'null') {
            return null;
        }

        $decoded = json_decode($raw, true);

        if (! is_array($decoded)) {
            return 'Error: settings_json must be a valid JSON object.';
        }

        return $decoded;
    }
}

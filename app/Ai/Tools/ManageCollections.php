<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\LogsAiToolUse;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Services\Collections\ApplyCollectionPackService;
use App\Services\Collections\ApplyFieldPackService;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Support\Collections\CollectionFieldSettingsPipeline;
use App\Support\Collections\CollectionPacks\CollectionPackRegistry;
use App\Support\Collections\FieldPacks\FieldPackRegistry;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * AI tool for listing and mutating content collections and their settings.
 */
class ManageCollections implements Tool
{
    use ChecksAiPermissions;
    use LogsAiToolUse;

    /**
     * Describe what this tool does for the model.
     */
    public function description(): Stringable|string
    {
        return 'List, get, create, update, soft-delete, restore, or force-delete content collections; create/update/delete fields; list or apply field packs and collection packs (e.g. SEO entity, Articles).';
    }

    /**
     * Execute the tool request and return a string result for the model.
     */
    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            $action = (string) $request->string('action');

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
                'delete_field' => $this->deleteField($request),
                'list_field_packs' => $this->listFieldPacks(),
                'apply_field_pack' => $this->applyFieldPack($request),
                'list_collection_packs' => $this->listCollectionPacks(),
                'apply_collection_pack' => $this->applyCollectionPack($request),
                'duplicate' => $this->duplicateCollection($request),
                default => 'Error: Unknown action. Use list, get, create, update, delete, restore, force_delete, create_field, update_field, delete_field, list_field_packs, apply_field_pack, list_collection_packs, apply_collection_pack, or duplicate.',
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
                'list|get|create|update|delete|restore|force_delete|create_field|update_field|delete_field|list_field_packs|apply_field_pack|list_collection_packs|apply_collection_pack|duplicate'
            ),
            'collection_id' => $schema->integer(),
            'trashed' => $schema->boolean()->description('For list, return only soft-deleted collections'),
            'field_id' => $schema->integer(),
            'name' => $schema->string()->description('Collection name, or field name for *_field actions; optional override for apply_collection_pack'),
            'slug' => $schema->string()->description('Collection slug; optional override for apply_collection_pack'),
            'is_singleton' => $schema->boolean(),
            'type' => $schema->string()->description('Field type enum value, e.g. string, textarea, boolean'),
            'translatable' => $schema->boolean(),
            'settings_json' => $schema->string()->description('Optional JSON object for field settings'),
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
            'collections' => $collections->map(fn (Collection $collection): array => [
                'id' => $collection->id,
                'name' => $collection->name,
                'slug' => $collection->slug,
                'is_singleton' => $collection->is_singleton,
                'sort_order' => $collection->sort_order,
                'deleted_at' => $collection->deleted_at,
                'fields' => $collection->fields->map(fn (CollectionField $field): array => [
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

        if ($collection === null) {
            return 'Error: Collection not found.';
        }

        return json_encode([
            'id' => $collection->id,
            'name' => $collection->name,
            'slug' => $collection->slug,
            'url' => route('collections.show', $collection),
            'is_singleton' => $collection->is_singleton,
            'items_count' => $collection->items_count,
            'fields' => $collection->fields->map(fn ($field): array => [
                'id' => $field->id,
                'name' => $field->name,
                'type' => $field->type?->value ?? $field->type,
                'translatable' => (bool) $field->translatable,
                'settings' => $field->settings,
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

        // ponytail: return existing on slug collision so model retries don't dead-end
        $existing = Collection::query()->where('slug', $slug)->first();

        if ($existing !== null) {
            return json_encode([
                'ok' => true,
                'created' => false,
                'url' => route('collections.show', $existing),
                'collection' => $existing->only(['id', 'name', 'slug', 'is_singleton']),
            ], JSON_PRETTY_PRINT) ?: '{}';
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

        $name = $source->name.' Copy';
        $baseSlug = Str::slug($name);
        $slug = $baseSlug;
        $suffix = 2;

        while (Collection::query()->withTrashed()->where('slug', $slug)->exists()) {
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
            $assembler = app(CollectionItemValuesAssembler::class);
            $normalizer = app(CollectionItemDataNormalizer::class);
            $writer = app(CollectionItemValuesWriter::class);

            foreach ($source->items()->oldest('id')->limit(5)->get() as $sourceItem) {
                /** @var CollectionItem $sourceItem */
                $item = $duplicate->items()->create([]);
                $writer->sync(
                    $item,
                    $duplicate,
                    $normalizer->normalize($duplicate, $assembler->assemble($sourceItem), true),
                );
                $sampleCount++;
            }
        }

        $this->logAiMutation($duplicate, 'duplicate_collection');

        return json_encode([
            'ok' => true,
            'collection' => $duplicate->only(['id', 'name', 'slug', 'is_singleton']),
            'fields_copied' => $source->fields->count(),
            'sample_items_copied' => $sampleCount,
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
    }

    private function listFieldPacks(): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanShowCollections)) {
            return $error;
        }

        return json_encode([
            'packs' => FieldPackRegistry::summaries(),
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
            'packs' => CollectionPackRegistry::summaries(),
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

    private function createField(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanEditCollections)) {
            return $error;
        }

        $collection = Collection::query()->find($request->integer('collection_id'));

        if ($collection === null) {
            return 'Error: Collection not found.';
        }

        $name = trim((string) $request->string('name'));
        $typeValue = trim((string) $request->string('type'));

        if ($name === '') {
            return 'Error: name is required for create_field.';
        }

        if (! preg_match('/^[a-z][a-z0-9_]*$/', $name)) {
            return 'Error: field name must match /^[a-z][a-z0-9_]*$/.';
        }

        $type = FieldTypeEnum::tryFrom($typeValue);

        if ($type === null) {
            return 'Error: Invalid field type. Use one of: '.implode(', ', FieldTypeEnum::values()).'.';
        }

        if ($collection->fields()->where('name', $name)->exists()) {
            return 'Error: A field named '.$name.' already exists on this collection.';
        }

        $settings = $this->decodeSettings($request);

        if (is_string($settings)) {
            return $settings;
        }

        $settings = app(CollectionFieldSettingsPipeline::class)
            ->normalizeAndValidate($settings, $type);

        if (is_string($settings)) {
            return $settings;
        }

        $translatable = $type->supportsTranslatable() && $request->boolean('translatable');

        $field = $collection->fields()->create([
            'name' => $name,
            'type' => $type,
            'translatable' => $translatable,
            'settings' => $settings === [] ? null : $settings,
        ]);

        $this->logAiMutation($field, 'create_field');

        return json_encode([
            'ok' => true,
            'field' => [
                'id' => $field->id,
                'collection_id' => $field->collection_id,
                'name' => $field->name,
                'type' => $field->type->value,
                'translatable' => $field->translatable,
                'settings' => $field->settings,
            ],
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function updateField(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanEditCollections)) {
            return $error;
        }

        $field = $this->findField($request);

        if (is_string($field)) {
            return $field;
        }

        $attributes = [];

        if ($request->filled('name')) {
            $name = trim((string) $request->string('name'));

            if (! preg_match('/^[a-z][a-z0-9_]*$/', $name)) {
                return 'Error: field name must match /^[a-z][a-z0-9_]*$/.';
            }

            $duplicate = CollectionField::query()
                ->where('collection_id', $field->collection_id)
                ->where('name', $name)
                ->whereKeyNot($field->id)
                ->exists();

            if ($duplicate) {
                return 'Error: A field named '.$name.' already exists on this collection.';
            }

            $attributes['name'] = $name;
        }

        if ($request->filled('type')) {
            $type = FieldTypeEnum::tryFrom(trim((string) $request->string('type')));

            if ($type === null) {
                return 'Error: Invalid field type. Use one of: '.implode(', ', FieldTypeEnum::values()).'.';
            }

            $attributes['type'] = $type;
        }

        if ($request->has('translatable')) {
            $attributes['translatable'] = (bool) $request->boolean('translatable');
        }

        if ($request->filled('settings_json')) {
            $settings = $this->decodeSettings($request);

            if (is_string($settings)) {
                return $settings;
            }

            $typeForSettings = ($attributes['type'] ?? $field->type);
            $typeForSettings = $typeForSettings instanceof FieldTypeEnum
                ? $typeForSettings
                : FieldTypeEnum::tryFrom((string) $typeForSettings);

            $settings = app(CollectionFieldSettingsPipeline::class)
                ->normalizeAndValidate($settings, $typeForSettings);

            if (is_string($settings)) {
                return $settings;
            }

            $attributes['settings'] = $settings === [] ? null : $settings;
        }

        if ($attributes === []) {
            return 'Error: Provide name, type, translatable, and/or settings_json to update.';
        }

        $resultingType = $attributes['type'] ?? $field->type;
        if ($resultingType instanceof FieldTypeEnum && ! $resultingType->supportsTranslatable()) {
            $attributes['translatable'] = false;
        }

        $field->update($attributes);
        $this->logAiMutation($field, 'update_field');
        $field = $field->fresh();

        return json_encode([
            'ok' => true,
            'field' => [
                'id' => $field->id,
                'collection_id' => $field->collection_id,
                'name' => $field->name,
                'type' => $field->type->value,
                'translatable' => $field->translatable,
                'settings' => $field->settings,
            ],
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

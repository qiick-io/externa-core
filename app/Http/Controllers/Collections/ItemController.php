<?php

namespace App\Http\Controllers\Collections;

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\BulkItemActionRequest;
use App\Http\Requests\Collections\StoreCollectionItemRequest;
use App\Http\Requests\Collections\UpdateCollectionItemRequest;
use App\Http\Requests\Collections\UpdateCollectionListColumnsRequest;
use App\Http\Resources\Admin\ActivityLogResource;
use App\Http\Resources\CollectionItemResource;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Authorization\EffectivePermissionResolver;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemExportService;
use App\Services\Collections\CollectionItemOptionsService;
use App\Services\Collections\CollectionItemQueryService;
use App\Services\Collections\CollectionItemRevisionRecorder;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\Collections\CollectionListColumnsNormalizer;
use App\Services\Collections\CollectionListDisplayEnricher;
use App\Services\Collections\FieldConditionEvaluator;
use App\Services\Collections\ItemRolePreviewService;
use App\Services\Settings\SettingsRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Activitylog\Models\Activity;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * CRUD and relational field option endpoints for non-singleton collection items.
 */
class ItemController extends Controller
{
    public function __construct(
        private CollectionItemQueryService $itemQueryService,
        private CollectionItemDataNormalizer $itemDataNormalizer,
        private CollectionItemValuesWriter $collectionItemValuesWriter,
        private CollectionItemValuesAssembler $collectionItemValuesAssembler,
        private CollectionItemOptionsService $collectionItemOptionsService,
        private CollectionListColumnsNormalizer $listColumnsNormalizer,
        private CollectionListDisplayEnricher $listDisplayEnricher,
        private SettingsRepository $settingsRepository,
        private CollectionPermissionEnforcer $permissionEnforcer,
        private CollectionItemExportService $itemExportService,
        private ItemRolePreviewService $itemRolePreviewService,
        private CollectionItemRevisionRecorder $revisionRecorder,
        private EffectivePermissionResolver $permissionResolver,
        private FieldConditionEvaluator $fieldConditionEvaluator,
    ) {}

    /**
     * List collection items or redirect singleton collections to their editor.
     */
    public function index(Request $request, Collection $collection): Response|RedirectResponse
    {
        $collection->load(['fields' => fn ($q) => $q->ordered()]);

        if ($collection->is_singleton) {
            $first = $collection->items()->first();
            if ($first !== null) {
                return redirect()->to(
                    route('collections.show', $collection).'?'.http_build_query(['item' => $first->id])
                );
            }

            return redirect()->route('collections.show', $collection);
        }

        $filters = $request->query('filter', []);
        if (! is_array($filters)) {
            $filters = [];
        }

        /** @var array<string, mixed> $stringFilters */
        $stringFilters = [];
        foreach ($filters as $key => $value) {
            if (! is_string($key) || $key === '') {
                continue;
            }
            if (is_string($value) || is_numeric($value) || is_bool($value) || is_array($value) || $value === null) {
                $stringFilters[$key] = $value;
            }
        }

        $trashed = $request->boolean('trashed');
        $query = CollectionItem::query()
            ->when($trashed, fn ($query) => $query->onlyTrashed())
            ->where('collection_id', $collection->id)
            ->with([
                'fieldValues',
                'userCreated:id,first_name,last_name,email',
                'userUpdated:id,first_name,last_name,email',
                'collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()]),
            ]);
        $this->itemQueryService->applyFilters($query, $collection, $stringFilters);

        $sortParam = $request->query('sort');
        $directionParam = $request->query('direction');
        $sortState = $this->itemQueryService->applySort(
            $query,
            $collection,
            is_string($sortParam) ? $sortParam : null,
            is_string($directionParam) ? $directionParam : null,
        );

        $listColumns = $this->resolveListColumns($request, $collection);
        $columnAligns = $this->resolveColumnAligns($request, $collection, $listColumns);

        $this->permissionEnforcer->applyItemFilterToQuery($request, $collection, $query);

        $paginator = $query->paginate(15)->withQueryString();
        $rows = $paginator->getCollection()
            ->map(fn (CollectionItem $item): array => (new CollectionItemResource($item))->toArray($request))
            ->all();
        $rows = $this->listDisplayEnricher->enrich($collection, $rows, $listColumns);
        $paginator->setCollection(collect($rows));

        return Inertia::render('collections/items/index', [
            'collection' => $collection,
            'items' => $paginator,
            'list_columns' => $listColumns,
            'column_aligns' => $columnAligns,
            'related_fields_catalog' => $this->listColumnsNormalizer->relatedFieldsCatalog($collection),
            'filters' => [
                ...$stringFilters,
                'trashed' => $trashed,
                'sort' => $sortState['sort'],
                'direction' => $sortState['direction'],
            ],
        ]);
    }

    /**
     * Download filtered collection items as CSV or JSON (capped).
     */
    public function export(Request $request, Collection $collection): StreamedResponse|RedirectResponse
    {
        if ($collection->is_singleton) {
            return redirect()->route('collections.show', $collection);
        }

        $format = strtolower((string) $request->query('format', 'csv'));
        if (! in_array($format, ['csv', 'json'], true)) {
            abort(422, 'format must be csv or json.');
        }

        $filters = $request->query('filter', []);
        if (! is_array($filters)) {
            $filters = [];
        }

        /** @var array<string, mixed> $stringFilters */
        $stringFilters = [];
        foreach ($filters as $key => $value) {
            if (! is_string($key) || $key === '') {
                continue;
            }
            if (is_string($value) || is_numeric($value) || is_bool($value) || is_array($value) || $value === null) {
                $stringFilters[$key] = $value;
            }
        }

        $sortParam = $request->query('sort');
        $directionParam = $request->query('direction');

        return $this->itemExportService->download(
            $collection,
            $format,
            $stringFilters,
            is_string($sortParam) ? $sortParam : null,
            is_string($directionParam) ? $directionParam : null,
            $request,
        );
    }

    /**
     * Persist the current user's list column preferences for a collection.
     */
    public function updateListColumns(
        UpdateCollectionListColumnsRequest $request,
        Collection $collection,
    ): RedirectResponse {
        $user = $request->user();
        abort_if($user === null, 403);

        $this->settingsRepository->set(
            SettingsRepository::SCOPE_USER,
            'collection_list',
            'collection_'.$collection->id,
            $request->input('columns'),
            $user->id,
        );

        $this->settingsRepository->set(
            SettingsRepository::SCOPE_USER,
            'collection_list',
            'collection_'.$collection->id.'_aligns',
            $request->input('aligns', []),
            $user->id,
        );

        return redirect()->back();
    }

    /**
     * Render the create-item form or redirect singleton collections.
     */
    public function newItem(Request $request, Collection $collection): Response|RedirectResponse
    {
        if ($collection->is_singleton && $collection->items()->exists()) {
            abort(422, __('A singleton collection already has its content item.'));
        }

        if ($collection->is_singleton) {
            return redirect()->route('collections.show', $collection);
        }

        $collection->load(['fields' => fn ($q) => $q->ordered()]);

        return Inertia::render('collections/items/form', [
            'collection' => $collection,
            'item' => null,
            'rawData' => [],
            'isNew' => true,
            'relatedCollections' => $this->relatedCollectionsForSelect(),
            'fieldGrants' => $this->permissionEnforcer->fieldGrantsForForm($request, $collection),
            'previewRoles' => $this->previewRoles($request),
            'activityLogs' => null,
        ]);
    }

    /**
     * Create a collection item from validated field data.
     */
    public function store(StoreCollectionItemRequest $request, Collection $collection): RedirectResponse
    {
        if ($collection->is_singleton && $collection->items()->exists()) {
            abort(422, __('A singleton collection already has its content item.'));
        }

        $data = $request->validated('data') ?? [];
        if (! is_array($data)) {
            $data = [];
        }
        $this->permissionEnforcer->assertWritableFields($request, $collection, $data, 'create');

        $item = $this->persistNewItem($collection, $data, creating: true);

        return $this->redirectAfterItemSave(
            $collection,
            $item,
            $this->itemSaveAction($request),
            __('Item created.'),
        );
    }

    /**
     * Show the item editor or redirect singleton collections.
     */
    public function show(Request $request, Collection $collection, CollectionItem $item): Response|RedirectResponse
    {
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemReadable($request, $collection, $item);

        if ($collection->is_singleton) {
            return redirect()->route('collections.show', $collection);
        }

        $collection->load(['fields' => fn ($q) => $q->ordered()]);
        $item->load([
            'fieldValues',
            'userCreated:id,first_name,last_name,email',
            'userUpdated:id,first_name,last_name,email',
            'collection.fields',
        ]);

        $rawPublished = $this->collectionItemValuesAssembler->assemble($item);
        $version = $request->query('version', $collection->versioning ? 'draft' : 'published');
        if (! in_array($version, ['published', 'draft'], true)) {
            $version = 'published';
        }
        if (! $collection->versioning) {
            $version = 'published';
        }

        $draftData = is_array($item->draft_data) ? $item->draft_data : null;
        $rawData = ($version === 'draft' && $draftData !== null)
            ? $draftData
            : $rawPublished;

        $activityLogs = Activity::query()
            ->forSubject($item)
            ->with(['causer', 'subject'])
            ->latest('id')
            ->paginate($request->integer('per_page', 10))
            ->withQueryString();

        $itemPayload = (new CollectionItemResource($item))->toArray($request);
        $itemPayload['has_draft'] = $draftData !== null;
        $itemPayload['draft_data'] = $draftData;

        return Inertia::render('collections/items/form', [
            'collection' => $collection,
            'item' => $itemPayload,
            'rawData' => $rawData,
            'publishedData' => $rawPublished,
            'contentVersion' => $version,
            'isNew' => false,
            'relatedCollections' => $this->relatedCollectionsForSelect(),
            'fieldGrants' => $this->permissionEnforcer->fieldGrantsForForm($request, $collection),
            'previewRoles' => $this->previewRoles($request),
            'activityLogs' => ActivityLogResource::collection($activityLogs),
            'chat_count' => $item->chat?->messages()->count() ?? 0,
        ]);
    }

    /**
     * Preview item field data as seen by a role (including public).
     */
    public function previewAsRole(Request $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemReadable($request, $collection, $item);
        abort_unless($this->userCanPreviewAsRole($request->user()), 403);

        $validated = $request->validate([
            'role_id' => ['nullable', 'integer', 'exists:roles,id'],
            'as_public' => ['nullable', 'boolean'],
        ]);

        $asPublic = (bool) ($validated['as_public'] ?? false);
        if (! $asPublic && empty($validated['role_id'])) {
            return response()->json(['message' => 'role_id or as_public is required.'], 422);
        }

        $role = $this->itemRolePreviewService->resolveRole(
            isset($validated['role_id']) ? (int) $validated['role_id'] : null,
            $asPublic,
        );

        $item->loadMissing(['collection.fields', 'fieldValues']);

        return response()->json(
            $this->itemRolePreviewService->preview($request, $collection, $item, $role),
        );
    }

    /**
     * Update a collection item while preserving readonly field values.
     * When collection versioning is on and version=draft, writes draft_data only.
     */
    public function update(UpdateCollectionItemRequest $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemWritable($request, $collection, $item);

        $version = (string) ($request->validated('version') ?? 'published');
        if (! $collection->versioning) {
            $version = 'published';
        }

        // Directus-like: published workspace is read-only when versioning is enabled.
        if ($collection->versioning && $version === 'published') {
            return redirect()
                ->route('collections.items.show', [
                    'collection' => $collection,
                    'item' => $item,
                    'version' => 'published',
                ])
                ->with('error', __('Switch to Draft to edit, then Publish.'));
        }

        $base = $version === 'draft' && is_array($item->draft_data)
            ? $item->draft_data
            : $this->collectionItemValuesAssembler->assemble($item);

        $data = $base;

        $incoming = $request->validated('data') ?? [];
        if (is_array($incoming)) {
            $this->permissionEnforcer->assertWritableFields($request, $collection, $incoming, 'update');
            $collection->loadMissing('fields');
            // Preview = base + attempted write so conditional readonly sees sibling values.
            $preview = array_replace($base, $incoming);
            $incoming = $this->fieldConditionEvaluator->withoutReadonlyFields(
                $collection->fields,
                $preview,
                $incoming,
            );

            foreach ($incoming as $key => $value) {
                // ponytail: array_merge appends list fields (blocks/m2a/files); only merge associative maps (locales).
                if (
                    is_array($value)
                    && isset($data[$key])
                    && is_array($data[$key])
                    && ! array_is_list($value)
                ) {
                    $data[$key] = array_merge($data[$key], $value);
                } else {
                    $data[$key] = $value;
                }
            }
        }

        $action = $this->itemSaveAction($request);

        if ($action === 'copy' && ! $collection->is_singleton) {
            abort_unless(
                $request->user()?->can(PermissionEnum::CanCreateCollections->value),
                403,
            );

            $copy = $this->persistNewItem($collection, $data, creating: true);

            return $this->redirectAfterItemSave(
                $collection,
                $copy,
                'stay',
                __('Item created.'),
            );
        }

        $normalized = $this->itemDataNormalizer->normalize($collection, $data, false);

        if ($version === 'draft') {
            $item->draft_data = $normalized;
            $item->save();
            $this->revisionRecorder->record($item, [
                'source' => 'draft',
                'version' => 'draft',
            ], $normalized);

            return $this->redirectAfterItemSave(
                $collection,
                $item,
                $action,
                __('Draft saved.'),
                draft: true,
            );
        }

        $this->collectionItemValuesWriter->sync($item->fresh(), $collection, $normalized);

        return $this->redirectAfterItemSave(
            $collection,
            $item,
            $action,
            __('Item updated.'),
        );
    }

    /**
     * Promote draft_data into published field values (content versioning).
     */
    public function publish(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemWritable($request, $collection, $item);
        abort_unless($collection->versioning, 422);

        $draft = is_array($item->draft_data) ? $item->draft_data : null;
        if ($draft === null) {
            return redirect()
                ->route('collections.items.show', [
                    'collection' => $collection,
                    'item' => $item,
                    'version' => 'draft',
                ])
                ->with('error', __('No draft changes to publish.'));
        }

        $normalized = $this->itemDataNormalizer->normalize($collection, $draft, false);
        $this->collectionItemValuesWriter->sync($item->fresh(), $collection, $normalized);

        // Keep draft in sync with published after promote (empty workspace again).
        $item->draft_data = null;
        $item->save();

        return redirect()->route('collections.items.show', [
            'collection' => $collection,
            'item' => $item,
            'version' => 'published',
        ])->with('success', __('Published.'));
    }

    /**
     * Soft-delete a collection item.
     */
    public function destroy(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemWritable($request, $collection, $item);

        $item->delete();

        return redirect()->route('collections.items.index', $collection)
            ->with('success', __('Item deleted.'));
    }

    /**
     * Restore a soft-deleted collection item.
     */
    public function restore(Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->assertItemBelongsToCollection($collection, $item);

        $item->restore();

        return redirect()->route('collections.items.index', [
            'collection' => $collection,
            'trashed' => 1,
        ])->with('success', __('Item restored.'));
    }

    /**
     * Permanently delete a collection item.
     */
    public function forceDelete(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemWritable($request, $collection, $item);

        $item->forceDelete();

        return redirect()->route('collections.items.index', [
            'collection' => $collection,
            'trashed' => 1,
        ])->with('success', __('Item permanently deleted.'));
    }

    /**
     * Run a bulk delete, restore, or force-delete action on selected items.
     */
    public function bulk(BulkItemActionRequest $request, Collection $collection): RedirectResponse
    {
        $action = $request->validated('action');
        /** @var list<int> $ids */
        $ids = $request->validated('ids');

        $query = CollectionItem::query()
            ->where('collection_id', $collection->id)
            ->whereIn('id', $ids);

        if ($action === 'restore' || $action === 'force_delete') {
            $query->onlyTrashed();
        }

        $items = $query->get();

        foreach ($items as $item) {
            if ($action !== 'restore') {
                $this->permissionEnforcer->assertItemWritable($request, $collection, $item);
            }

            match ($action) {
                'delete' => $item->delete(),
                'restore' => $item->restore(),
                'force_delete' => $item->forceDelete(),
            };
        }

        return redirect()
            ->back()
            ->with('success', __('Bulk action completed.'));
    }

    /**
     * Paginate selectable options for a relational collection field.
     *
     * ponytail: renamed from `options` because Wayfinder codegen shadows RouteQueryOptions.
     */
    public function fieldOptions(Request $request, Collection $collection): JsonResponse
    {
        $validated = $request->validate([
            'field_id' => ['required', 'integer'],
            'related_collection_id' => ['nullable', 'integer', 'exists:collections,id'],
            'display_field' => ['nullable', 'string', 'max:64'],
            'search' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $field = CollectionField::query()
            ->where('collection_id', $collection->id)
            ->where('id', $validated['field_id'])
            ->firstOrFail();

        $relatedCollectionOverride = isset($validated['related_collection_id'])
            ? (int) $validated['related_collection_id']
            : null;

        $paginator = $this->collectionItemOptionsService->paginateForField(
            $field,
            $validated['search'] ?? null,
            $validated['per_page'] ?? 20,
            $relatedCollectionOverride,
            isset($validated['display_field']) ? (string) $validated['display_field'] : null,
        );

        return response()->json($paginator);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function persistNewItem(Collection $collection, array $data, bool $creating): CollectionItem
    {
        $normalized = $this->itemDataNormalizer->normalize($collection, $data, $creating);
        $item = $collection->items()->create([]);
        $this->collectionItemValuesWriter->sync($item, $collection, $normalized);

        return $item;
    }

    private function itemSaveAction(Request $request): string
    {
        $action = (string) $request->input('save_action', 'stay');

        return in_array($action, ['stay', 'create_new', 'copy'], true) ? $action : 'stay';
    }

    private function redirectAfterItemSave(
        Collection $collection,
        CollectionItem $item,
        string $action,
        string $success,
        bool $draft = false,
    ): RedirectResponse {
        if ($action === 'create_new' && ! $collection->is_singleton) {
            return redirect()
                ->route('collections.items.new', $collection)
                ->with('success', $success);
        }

        $parameters = [
            'collection' => $collection,
            'item' => $item,
        ];

        if ($draft) {
            $parameters['version'] = 'draft';
        }

        return redirect()
            ->route('collections.items.show', $parameters)
            ->with('success', $success);
    }

    /**
     * Abort when the item does not belong to the route collection.
     */
    private function assertItemBelongsToCollection(Collection $collection, CollectionItem $item): void
    {
        abort_if($item->collection_id !== $collection->id, 404);
    }

    /**
     * Load related collections for relational field pickers.
     *
     * @return list<array{id: int, name: string, slug: string}>
     */
    private function relatedCollectionsForSelect(): array
    {
        return $this->collectionItemOptionsService->collectionsForSelect();
    }

    /**
     * @return list<string>
     */
    private function resolveListColumns(Request $request, Collection $collection): array
    {
        $user = $request->user();
        $stored = $user !== null
            ? $this->settingsRepository->get(
                SettingsRepository::SCOPE_USER,
                'collection_list',
                'collection_'.$collection->id,
                $user->id,
            )
            : null;

        return $this->listColumnsNormalizer->normalize($stored, $collection);
    }

    /**
     * @param  list<string>  $listColumns
     * @return array<string, 'left'|'center'|'right'>
     */
    private function resolveColumnAligns(Request $request, Collection $collection, array $listColumns): array
    {
        $user = $request->user();
        if ($user === null) {
            return [];
        }

        $stored = $this->settingsRepository->get(
            SettingsRepository::SCOPE_USER,
            'collection_list',
            'collection_'.$collection->id.'_aligns',
            $user->id,
        );

        if (! is_array($stored)) {
            return [];
        }

        $allowed = array_flip($listColumns);
        $out = [];

        foreach ($stored as $path => $align) {
            if (! is_string($path) || ! isset($allowed[$path])) {
                continue;
            }

            if (! in_array($align, ['left', 'center', 'right'], true)) {
                continue;
            }

            $out[$path] = $align;
        }

        return $out;
    }

    /**
     * Compact role list for the “Preview as…” dialog.
     * Super-admin and admin only; omits roles the current user already holds.
     *
     * @return list<array{id: int, name: string, is_public: bool}>
     */
    private function previewRoles(Request $request): array
    {
        $user = $request->user();
        if (! $this->userCanPreviewAsRole($user)) {
            return [];
        }

        $ownIds = array_flip($this->permissionResolver->effectiveRoleIds($user));

        return Role::query()
            ->orderBy('name')
            ->get(['id', 'name'])
            ->reject(static fn (Role $role): bool => isset($ownIds[(int) $role->id]))
            ->map(static fn (Role $role): array => [
                'id' => (int) $role->id,
                'name' => (string) $role->name,
                'is_public' => $role->isPublic(),
            ])
            ->values()
            ->all();
    }

    private function userCanPreviewAsRole(mixed $user): bool
    {
        if (! $user instanceof User) {
            return false;
        }

        $names = $this->permissionResolver->roleNamesFor($user);

        return in_array(RoleEnum::SuperAdmin->value, $names, true)
            || in_array(RoleEnum::Admin->value, $names, true);
    }
}

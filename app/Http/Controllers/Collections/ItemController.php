<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Actions\Collections\CreateCollectionItemAction;
use App\Actions\Collections\MoveCollectionItemAction;
use App\Actions\Collections\UpdateCollectionItemAction;
use App\Data\Collections\CollectionItemWriteData;
use App\Enums\CollectionPermissionActionEnum;
use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\BuildLivePreviewUrlRequest;
use App\Http\Requests\Collections\BulkItemActionRequest;
use App\Http\Requests\Collections\ListCollectionFieldOptionsRequest;
use App\Http\Requests\Collections\PreviewCollectionItemAsRoleRequest;
use App\Http\Requests\Collections\StoreCollectionItemRequest;
use App\Http\Requests\Collections\UpdateCollectionItemRequest;
use App\Http\Requests\Collections\UpdateCollectionListColumnsRequest;
use App\Http\Requests\Concerns\ValidatesListPerPageTrait;
use App\Http\Resources\Admin\ActivityLogResource;
use App\Http\Resources\CollectionItemResource;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Collections\CollectionItemDataNormalizerService;
use App\Services\Collections\CollectionItemExportService;
use App\Services\Collections\CollectionItemListService;
use App\Services\Collections\CollectionItemOptionsService;
use App\Services\Collections\CollectionItemValuesAssemblerService;
use App\Services\Collections\FieldConditionEvaluatorService;
use App\Services\Collections\ItemRolePreviewService;
use App\Services\Collections\LivePreviewAsOfResolverService;
use App\Services\Collections\LivePreviewUrlBuilderService;
use App\Services\Http\SafeReturnUrlService;
use App\Services\Settings\SettingsRepositoryService;
use App\Traits\AssertsItemBelongsToCollectionTrait;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use InvalidArgumentException;
use Spatie\Activitylog\Models\Activity;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * CRUD and relational field option endpoints for non-singleton collection items.
 */
class ItemController extends Controller
{
    use AssertsItemBelongsToCollectionTrait;
    use ValidatesListPerPageTrait;

    public function __construct(
        private CollectionItemListService $itemListService,
        private CollectionItemDataNormalizerService $itemDataNormalizer,
        private CreateCollectionItemAction $createCollectionItemAction,
        private UpdateCollectionItemAction $updateCollectionItemAction,
        private MoveCollectionItemAction $moveCollectionItemAction,
        private CollectionItemValuesAssemblerService $collectionItemValuesAssembler,
        private CollectionItemOptionsService $collectionItemOptionsService,
        private SettingsRepositoryService $settingsRepository,
        private CollectionPermissionEnforcerService $permissionEnforcer,
        private CollectionItemExportService $itemExportService,
        private ItemRolePreviewService $itemRolePreviewService,
        private LivePreviewUrlBuilderService $livePreviewUrlBuilder,
        private EffectivePermissionResolverService $permissionResolver,
        private FieldConditionEvaluatorService $fieldConditionEvaluator,
    ) {}

    /**
     * List collection items or redirect singleton collections to their editor.
     */
    public function index(Request $request, Collection $collection): Response|RedirectResponse
    {
        Gate::forUser($request->user())->authorize('viewItems', $collection);

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

        return Inertia::render('collections/items/index', $this->itemListService->indexProps(
            $request,
            $collection,
            $this->validatedListPerPage($request),
        ));
    }

    /**
     * Download filtered collection items as CSV or JSON (capped).
     */
    public function export(Request $request, Collection $collection): StreamedResponse|RedirectResponse
    {
        Gate::forUser($request->user())->authorize('viewItems', $collection);

        if ($collection->is_singleton) {
            return redirect()->route('collections.show', $collection);
        }

        $format = strtolower((string) $request->query('format', 'csv'));
        if (! in_array($format, ['csv', 'json'], true)) {
            abort(422, __('format must be csv or json.'));
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
        Gate::forUser($request->user())->authorize('viewItems', $collection);

        $user = $request->user();
        abort_if($user === null, 403);

        $this->settingsRepository->set(
            SettingsRepositoryService::SCOPE_USER,
            'collection_list',
            'collection_'.$collection->id,
            $request->input('columns'),
            $user->id,
        );

        $this->settingsRepository->set(
            SettingsRepositoryService::SCOPE_USER,
            'collection_list',
            'collection_'.$collection->id.'_aligns',
            $request->input('aligns', []),
            $user->id,
        );

        if ($request->exists('layout')) {
            $this->settingsRepository->set(
                SettingsRepositoryService::SCOPE_USER,
                'collection_list',
                'collection_'.$collection->id.'_layout',
                $request->input('layout') ?? 'table',
                $user->id,
            );
        }

        if ($request->exists('kanban_field')) {
            $this->settingsRepository->set(
                SettingsRepositoryService::SCOPE_USER,
                'collection_list',
                'collection_'.$collection->id.'_kanban_field',
                $request->input('kanban_field'),
                $user->id,
            );
        }

        if ($request->exists('calendar_field')) {
            $this->settingsRepository->set(
                SettingsRepositoryService::SCOPE_USER,
                'collection_list',
                'collection_'.$collection->id.'_calendar_field',
                $request->input('calendar_field'),
                $user->id,
            );
        }

        return redirect()->back();
    }

    /**
     * Render the create-item form or redirect singleton collections.
     */
    public function newItem(Request $request, Collection $collection): Response|RedirectResponse
    {
        Gate::forUser($request->user())->authorize('createItems', $collection);

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
        Gate::forUser($request->user())->authorize('createItems', $collection);

        if ($collection->is_singleton && $collection->items()->exists()) {
            abort(422, __('A singleton collection already has its content item.'));
        }

        $data = $request->validated('data') ?? [];
        if (! is_array($data)) {
            $data = [];
        }
        $this->permissionEnforcer->assertWritableFields($request, $collection, $data, 'create');

        $item = $this->persistNewItem($collection, $data);

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
        Gate::forUser($request->user())->authorize('viewItems', $collection);
        $this->assertItemBelongsToCollection($collection, $item);
        abort_unless(Gate::forUser($request->user())->allows('view', [$item, $collection]), 404);

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
        $itemPayload['publish_at'] = $item->publish_at?->toIso8601String();
        $itemPayload['unpublish_at'] = $item->unpublish_at?->toIso8601String();
        $itemPayload['published_at'] = $this->resolvePublishedAtIso($item);
        $itemPayload['schedule_error'] = $item->schedule_error;
        $itemPayload['schedule_failed_at'] = $item->schedule_failed_at?->toIso8601String();
        $itemPayload['approval_status'] = $item->approval_status ?? 'draft';
        $itemPayload['rejection_note'] = $item->rejection_note;
        $itemPayload['submitted_by'] = $item->submitted_by;
        $itemPayload['reviewed_by'] = $item->reviewed_by;
        $itemPayload['reviewed_at'] = $item->reviewed_at?->toIso8601String();

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
            'livePreviewConfigured' => $this->livePreviewUrlBuilder->templateFor($collection) !== null,
        ]);
    }

    /**
     * Preview item field data as seen by a role (including public).
     */
    public function previewAsRole(PreviewCollectionItemAsRoleRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $validated = $request->validated();

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
     * Build a Live Preview frontend URL (signed token; no API key in the link).
     */
    public function livePreviewUrl(BuildLivePreviewUrlRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $validated = $request->validated();

        $version = (string) ($validated['version'] ?? 'published');
        $locale = isset($validated['locale']) && is_string($validated['locale']) && $validated['locale'] !== ''
            ? $validated['locale']
            : null;

        $asOf = null;
        $asOfRaw = isset($validated['as_of']) && is_string($validated['as_of'])
            ? trim($validated['as_of'])
            : '';
        if ($asOfRaw !== '') {
            try {
                $asOf = app(LivePreviewAsOfResolverService::class)->parseBounded($asOfRaw);
            } catch (InvalidArgumentException $exception) {
                throw ValidationException::withMessages([
                    'as_of' => [$exception->getMessage()],
                ]);
            }
        }

        $user = $request->user();
        abort_unless($user instanceof User, 401);

        try {
            $built = $this->livePreviewUrlBuilder->build($collection, $item, $version, $locale, $user, $asOf);
        } catch (InvalidArgumentException $exception) {
            throw ValidationException::withMessages([
                'as_of' => [$exception->getMessage()],
            ]);
        }

        return response()->json($built);
    }

    /**
     * Update a collection item while preserving readonly field values.
     * When collection versioning is on and version=draft, writes draft_data only.
     * Kanban board_move / calendar_move write the moved field to the published values, never to a draft.
     */
    public function update(UpdateCollectionItemRequest $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        Gate::forUser($request->user())->authorize('updateItems', $collection);
        $this->assertItemBelongsToCollection($collection, $item);
        Gate::forUser($request->user())->authorize('update', [$item, $collection]);

        $expectedUpdatedAt = $request->validated('expected_updated_at');
        if (is_string($expectedUpdatedAt) && $expectedUpdatedAt !== '' && $item->updated_at !== null) {
            // Compare at second precision — ISO8601 round-trips can differ in microseconds.
            if ($item->updated_at->getTimestamp() !== Carbon::parse($expectedUpdatedAt)->getTimestamp()) {
                throw ValidationException::withMessages([
                    'expected_updated_at' => [
                        __('Someone else saved this item while you were editing. Reload the page and try again.'),
                    ],
                ]);
            }
        }

        if ($request->boolean('board_move')) {
            $item = $this->moveCollectionItemAction->execute(
                $request,
                $collection,
                $item,
                $request->validated('data') ?? [],
                MoveCollectionItemAction::SOURCE_BOARD,
                afterItemId: $request->validated('after_item_id') !== null
                    ? (int) $request->validated('after_item_id')
                    : null,
                beforeItemId: $request->validated('before_item_id') !== null
                    ? (int) $request->validated('before_item_id')
                    : null,
            );

            return $this->redirectAfterItemSave(
                $collection,
                $item,
                $this->itemSaveAction($request),
                __('Item updated.'),
            );
        }

        if ($request->boolean('calendar_move')) {
            $item = $this->moveCollectionItemAction->execute(
                $request,
                $collection,
                $item,
                $request->validated('data') ?? [],
                MoveCollectionItemAction::SOURCE_CALENDAR,
            );

            return $this->redirectAfterItemSave(
                $collection,
                $item,
                $this->itemSaveAction($request),
                __('Item updated.'),
            );
        }

        $version = (string) ($request->validated('version') ?? 'published');
        if (! $collection->versioning) {
            $version = 'published';
        }

        // : published workspace is read-only when versioning is enabled.
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

            $data = $this->itemDataNormalizer->mergeIncoming($data, $incoming);
        }

        $action = $this->itemSaveAction($request);

        if ($action === 'copy' && ! $collection->is_singleton) {
            abort_unless(
                $request->user()?->can(PermissionEnum::CanCreateCollections->value),
                403,
            );

            $copy = $this->persistNewItem($collection, $data);

            return $this->redirectAfterItemSave(
                $collection,
                $copy,
                'stay',
                __('Item created.'),
            );
        }

        $scheduleWarningDate = null;
        if (
            $version === 'draft'
            && $collection->approvals_required
            && in_array((string) $item->approval_status, ['approved', 'rejected', 'in_review'], true)
            && $item->publish_at !== null
        ) {
            $scheduleWarningDate = $item->publish_at->timezone(config('app.timezone'))
                ->toDayDateTimeString();
        }

        $item = $this->updateCollectionItemAction->execute(new CollectionItemWriteData(
            collection: $collection,
            data: $data,
            item: $item,
            creating: false,
            version: $version === 'draft' ? 'draft' : 'published',
            shouldValidate: false,
            shouldMergeIncoming: false,
            shouldEnforceVersioningGuard: false,
        ));

        if ($version === 'draft') {
            $success = $scheduleWarningDate !== null
                ? __('Draft saved. Approval was reset; the scheduled publish on :date will not run until the item is approved again.', [
                    'date' => $scheduleWarningDate,
                ])
                : __('Draft saved.');

            return $this->redirectAfterItemSave(
                $collection,
                $item,
                $action,
                $success,
                draft: true,
            );
        }

        return $this->redirectAfterItemSave(
            $collection,
            $item,
            $action,
            __('Item updated.'),
        );
    }

    /**
     * Soft-delete a collection item.
     */
    public function destroy(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        Gate::forUser($request->user())->authorize('deleteItems', $collection);
        $this->assertItemBelongsToCollection($collection, $item);
        Gate::forUser($request->user())->authorize('delete', [$item, $collection]);

        $item->delete();

        return redirect()->route('collections.items.index', $collection)
            ->with('success', __('Item deleted.'));
    }

    /**
     * Restore a soft-deleted collection item.
     */
    public function restore(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        Gate::forUser($request->user())->authorize('updateItems', $collection);
        $this->assertItemBelongsToCollection($collection, $item);
        Gate::forUser($request->user())->authorize('update', [$item, $collection]);

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
        Gate::forUser($request->user())->authorize('deleteItems', $collection);
        $this->assertItemBelongsToCollection($collection, $item);
        Gate::forUser($request->user())->authorize('delete', [$item, $collection]);

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

        $collectionAction = match ($action) {
            'restore' => CollectionPermissionActionEnum::Update,
            default => CollectionPermissionActionEnum::Delete,
        };
        Gate::forUser($request->user())->authorize($collectionAction->itemsAbility(), $collection);

        $query = CollectionItem::query()
            ->where('collection_id', $collection->id)
            ->whereIn('id', $ids);

        if ($action === 'restore' || $action === 'force_delete') {
            $query->onlyTrashed();
        }

        $items = $query->get();

        // Authorize every selected item before mutating any (no partial apply on AuthZ fail).
        $itemAbility = $action === 'restore' ? 'update' : 'delete';
        foreach ($items as $item) {
            Gate::forUser($request->user())->authorize($itemAbility, [$item, $collection]);
        }

        CollectionItem::query()->getConnection()->transaction(function () use ($items, $action): void {
            foreach ($items as $item) {
                match ($action) {
                    'delete' => $item->delete(),
                    'restore' => $item->restore(),
                    'force_delete' => $item->forceDelete(),
                };
            }
        });

        return redirect()
            ->back()
            ->with('success', __('Bulk action completed.'));
    }

    /**
     * Paginate selectable options for a relational collection field.
     *
     * ponytail: renamed from `options` because Wayfinder codegen shadows RouteQueryOptions.
     */
    public function fieldOptions(ListCollectionFieldOptionsRequest $request, Collection $collection): JsonResponse
    {
        $validated = $request->validated();

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
    private function persistNewItem(Collection $collection, array $data): CollectionItem
    {
        return $this->createCollectionItemAction->execute(new CollectionItemWriteData(
            collection: $collection,
            data: $data,
            creating: true,
            shouldValidate: false,
        ));
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

        if ($action === 'stay') {
            $return = SafeReturnUrlService::from(request()->input('return'));
            if ($return !== null) {
                return redirect()->to($return)->with('success', $success);
            }
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
     * Load related collections for relational field pickers.
     *
     * @return list<array{id: int, name: string, slug: string}>
     */
    private function relatedCollectionsForSelect(): array
    {
        return $this->collectionItemOptionsService->collectionsForSelect();
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
        if (! PreviewCollectionItemAsRoleRequest::canPreviewAsRole($user)) {
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

    /**
     * Last promote time: published_at column, else legacy publish revision.
     */
    private function resolvePublishedAtIso(CollectionItem $item): ?string
    {
        if ($item->published_at !== null) {
            return $item->published_at->toIso8601String();
        }

        $fromRevision = $item->revisions()
            ->where('meta->source', 'publish')
            ->latest('id')
            ->value('created_at');

        if ($fromRevision === null) {
            return null;
        }

        return Carbon::parse($fromRevision)->toIso8601String();
    }
}

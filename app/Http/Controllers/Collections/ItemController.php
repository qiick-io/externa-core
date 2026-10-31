<?php

namespace App\Http\Controllers\Collections;

use App\Actions\Collections\CreateCollectionItemAction;
use App\Actions\Collections\UpdateCollectionItemAction;
use App\Data\Collections\CollectionItemWriteData;
use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
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
use App\Services\Collections\CollectionItemApprovalService;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemExportService;
use App\Services\Collections\CollectionItemOptionsService;
use App\Services\Collections\CollectionItemPublisher;
use App\Services\Collections\CollectionItemQueryService;
use App\Services\Collections\CollectionItemRevisionRecorder;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionListColumnsNormalizer;
use App\Services\Collections\CollectionListDisplayEnricher;
use App\Services\Collections\FieldConditionEvaluator;
use App\Services\Collections\ItemRolePreviewService;
use App\Services\Collections\LivePreviewUrlBuilder;
use App\Services\Settings\SettingsRepository;
use App\Support\Http\SafeReturnUrl;
use App\Support\Validation\SearchQueryRules;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;
use Spatie\Activitylog\Models\Activity;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * CRUD and relational field option endpoints for non-singleton collection items.
 */
class ItemController extends Controller
{
    /** First page size per kanban column (scroll fetches the next page). */
    private const KANBAN_PER_PAGE = 30;

    /** Hard cap for one calendar month fetch (visible grid + overflow notice). */
    private const CALENDAR_MAX_PER_PAGE = 500;

    public function __construct(
        private CollectionItemQueryService $itemQueryService,
        private CollectionItemDataNormalizer $itemDataNormalizer,
        private CreateCollectionItemAction $createCollectionItemAction,
        private UpdateCollectionItemAction $updateCollectionItemAction,
        private CollectionItemValuesAssembler $collectionItemValuesAssembler,
        private CollectionItemOptionsService $collectionItemOptionsService,
        private CollectionListColumnsNormalizer $listColumnsNormalizer,
        private CollectionListDisplayEnricher $listDisplayEnricher,
        private SettingsRepository $settingsRepository,
        private CollectionPermissionEnforcer $permissionEnforcer,
        private CollectionItemExportService $itemExportService,
        private ItemRolePreviewService $itemRolePreviewService,
        private LivePreviewUrlBuilder $livePreviewUrlBuilder,
        private CollectionItemPublisher $itemPublisher,
        private CollectionItemRevisionRecorder $revisionRecorder,
        private CollectionItemApprovalService $itemApprovals,
        private EffectivePermissionResolver $permissionResolver,
        private FieldConditionEvaluator $fieldConditionEvaluator,
    ) {}

    /**
     * List collection items or redirect singleton collections to their editor.
     */
    public function index(Request $request, Collection $collection): Response|RedirectResponse
    {
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Read,
        );

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

        $stringFilters = $this->parseStringFilters($request);
        $trashed = $request->boolean('trashed');
        $hasDraft = $collection->versioning && $request->boolean('has_draft');
        $inReview = $collection->approvals_required && $request->boolean('in_review');

        $listColumns = $this->resolveListColumns($request, $collection);
        $columnAligns = $this->resolveColumnAligns($request, $collection, $listColumns);
        $listLayout = $this->resolveListLayout($request, $collection);
        $kanbanField = $this->resolveKanbanField($request, $collection);
        $calendarField = $this->resolveCalendarField($request, $collection);

        $sortParam = $request->query('sort');
        $directionParam = $request->query('direction');
        $sort = is_string($sortParam) ? $sortParam : null;
        $direction = is_string($directionParam) ? $directionParam : null;

        $kanban = null;
        $calendar = null;
        if ($listLayout === 'kanban' && is_string($kanbanField) && $kanbanField !== '') {
            // Default board order: manual board_sort, then newest id.
            if ($sort === null || $sort === '') {
                $sort = 'board_sort';
                $direction = $direction ?? 'asc';
            }
            $sortProbe = $this->baseItemListQuery(
                $request,
                $collection,
                $stringFilters,
                $trashed,
                $hasDraft,
                $inReview,
            );
            $sortState = $this->itemQueryService->applySort($sortProbe, $collection, $sort, $direction);
            $kanban = $this->buildKanbanBoard(
                $request,
                $collection,
                $kanbanField,
                $stringFilters,
                $trashed,
                $hasDraft,
                $inReview,
                $sort,
                $direction,
                $listColumns,
            );
            // ponytail: table paginator unused in kanban; keep empty shell for shared props.
            $paginator = new LengthAwarePaginator([], 0, self::KANBAN_PER_PAGE);
        } elseif ($listLayout === 'calendar' && is_string($calendarField) && $calendarField !== '') {
            $monthParam = $request->query('calendar_month');
            $month = is_string($monthParam) && preg_match('/^\d{4}-\d{2}$/', $monthParam) === 1
                ? $monthParam
                : now()->format('Y-m');
            $range = $this->calendarVisibleRange($month);
            $sortState = $this->itemQueryService->applySort(
                $this->baseItemListQuery(
                    $request,
                    $collection,
                    $stringFilters,
                    $trashed,
                    $hasDraft,
                    $inReview,
                ),
                $collection,
                $sort,
                $direction,
            );
            $calendar = $this->paginateCalendarMonth(
                $request,
                $collection,
                $calendarField,
                $range['from'],
                $range['to'],
                $stringFilters,
                $trashed,
                $hasDraft,
                $inReview,
                $sort,
                $direction,
                $listColumns,
                self::CALENDAR_MAX_PER_PAGE,
                1,
            );
            $calendar['field'] = $calendarField;
            $calendar['month'] = $month;
            $calendar['from'] = $range['from'];
            $calendar['to'] = $range['to'];
            // ponytail: table paginator unused in calendar; keep empty shell for shared props.
            $paginator = new LengthAwarePaginator([], 0, self::CALENDAR_MAX_PER_PAGE);
        } else {
            $query = $this->baseItemListQuery(
                $request,
                $collection,
                $stringFilters,
                $trashed,
                $hasDraft,
                $inReview,
            );
            $sortState = $this->itemQueryService->applySort($query, $collection, $sort, $direction);

            $paginator = $query->paginate(15)->withQueryString();
            $rows = $this->mapItemRows(
                $request,
                $collection,
                $paginator->getCollection()->all(),
                $listColumns,
            );
            $paginator->setCollection(collect($rows));
        }

        return Inertia::render('collections/items/index', [
            'collection' => $collection,
            'items' => $paginator,
            'list_columns' => $listColumns,
            'column_aligns' => $columnAligns,
            'list_layout' => $listLayout,
            'kanban_field' => $kanbanField,
            'kanban' => $kanban,
            'calendar_field' => $calendarField,
            'calendar' => $calendar,
            'related_fields_catalog' => $this->listColumnsNormalizer->relatedFieldsCatalog($collection),
            'filters' => [
                ...$stringFilters,
                'trashed' => $trashed,
                'has_draft' => $hasDraft,
                'in_review' => $inReview,
                'sort' => $sortState['sort'],
                'direction' => $sortState['direction'],
            ],
        ]);
    }

    /**
     * Items for one calendar date range (same filters/search/permissions as the list).
     */
    public function calendarMonth(Request $request, Collection $collection): JsonResponse
    {
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Read,
        );
        abort_if($collection->is_singleton, 404);

        $collection->load(['fields' => fn ($q) => $q->ordered()]);

        $validated = $request->validate([
            'field' => ['required', 'string', 'max:64'],
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.self::CALENDAR_MAX_PER_PAGE],
        ]);

        $fieldName = $validated['field'];
        $field = $collection->fields->firstWhere('name', $fieldName);
        abort_unless(
            $field instanceof CollectionField && $field->type === FieldTypeEnum::Date,
            422,
            'field must be a date field.',
        );

        $stringFilters = $this->parseStringFilters($request);
        $trashed = $request->boolean('trashed');
        $hasDraft = $collection->versioning && $request->boolean('has_draft');
        $inReview = $collection->approvals_required && $request->boolean('in_review');
        $sortParam = $request->query('sort');
        $directionParam = $request->query('direction');
        $sort = is_string($sortParam) && $sortParam !== '' ? $sortParam : null;
        $direction = is_string($directionParam) && $directionParam !== ''
            ? $directionParam
            : null;

        $perPage = (int) ($validated['per_page'] ?? self::CALENDAR_MAX_PER_PAGE);
        $page = (int) ($validated['page'] ?? 1);

        $payload = $this->paginateCalendarMonth(
            $request,
            $collection,
            $fieldName,
            $validated['from'],
            $validated['to'],
            $stringFilters,
            $trashed,
            $hasDraft,
            $inReview,
            $sort,
            $direction,
            $this->resolveListColumns($request, $collection),
            $perPage,
            $page,
        );
        $payload['from'] = $validated['from'];
        $payload['to'] = $validated['to'];
        $payload['field'] = $fieldName;

        return response()->json($payload);
    }

    /**
     * Paginate one kanban column (same filters/search/permissions as the list).
     */
    public function kanbanColumn(Request $request, Collection $collection): JsonResponse
    {
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Read,
        );
        abort_if($collection->is_singleton, 404);

        $collection->load(['fields' => fn ($q) => $q->ordered()]);

        $validated = $request->validate([
            'field' => ['required', 'string', 'max:64'],
            'value' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $fieldName = $validated['field'];
        $field = $collection->fields->firstWhere('name', $fieldName);
        abort_unless(
            $field instanceof CollectionField
            && in_array($field->type, [FieldTypeEnum::Select, FieldTypeEnum::RadioGroup], true),
            422,
            'field must be a select or radio field.',
        );

        $stringFilters = $this->parseStringFilters($request);
        $trashed = $request->boolean('trashed');
        $hasDraft = $collection->versioning && $request->boolean('has_draft');
        $inReview = $collection->approvals_required && $request->boolean('in_review');
        $sortParam = $request->query('sort');
        $directionParam = $request->query('direction');
        $sort = is_string($sortParam) && $sortParam !== '' ? $sortParam : 'board_sort';
        $direction = is_string($directionParam) && $directionParam !== ''
            ? $directionParam
            : 'asc';

        $perPage = (int) ($validated['per_page'] ?? self::KANBAN_PER_PAGE);
        $page = (int) ($validated['page'] ?? 1);
        $columnValue = isset($validated['value']) ? (string) $validated['value'] : '';

        $payload = $this->paginateKanbanColumn(
            $request,
            $collection,
            $fieldName,
            $columnValue,
            $stringFilters,
            $trashed,
            $hasDraft,
            $inReview,
            $sort,
            $direction,
            $this->resolveListColumns($request, $collection),
            $perPage,
            $page,
        );

        return response()->json($payload);
    }

    /**
     * Download filtered collection items as CSV or JSON (capped).
     */
    public function export(Request $request, Collection $collection): StreamedResponse|RedirectResponse
    {
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Read,
        );

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
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Read,
        );

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

        if ($request->exists('layout')) {
            $this->settingsRepository->set(
                SettingsRepository::SCOPE_USER,
                'collection_list',
                'collection_'.$collection->id.'_layout',
                $request->input('layout') ?? 'table',
                $user->id,
            );
        }

        if ($request->exists('kanban_field')) {
            $this->settingsRepository->set(
                SettingsRepository::SCOPE_USER,
                'collection_list',
                'collection_'.$collection->id.'_kanban_field',
                $request->input('kanban_field'),
                $user->id,
            );
        }

        if ($request->exists('calendar_field')) {
            $this->settingsRepository->set(
                SettingsRepository::SCOPE_USER,
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
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Create,
        );

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
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Create,
        );

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
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Read,
        );
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
    public function previewAsRole(Request $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Read,
        );
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
     * Build a Live Preview frontend URL (signed token; no API key in the link).
     */
    public function livePreviewUrl(Request $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Read,
        );
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemReadable($request, $collection, $item);

        if ($this->livePreviewUrlBuilder->templateFor($collection) === null) {
            return response()->json([
                'message' => 'Configure a Live Preview URL on this collection (or Project settings default).',
            ], 422);
        }

        $validated = $request->validate([
            'version' => ['nullable', 'string', 'in:draft,published'],
            'locale' => ['nullable', 'string', 'max:16'],
        ]);

        $version = (string) ($validated['version'] ?? 'published');
        $locale = isset($validated['locale']) && is_string($validated['locale']) && $validated['locale'] !== ''
            ? $validated['locale']
            : null;

        $user = $request->user();
        abort_unless($user instanceof User, 401);

        try {
            $built = $this->livePreviewUrlBuilder->build($collection, $item, $version, $locale, $user);
        } catch (RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }

        return response()->json($built);
    }

    /**
     * Update a collection item while preserving readonly field values.
     * When collection versioning is on and version=draft, writes draft_data only.
     * Kanban board_move / calendar_move write the moved field to published values (Directus-like).
     */
    public function update(UpdateCollectionItemRequest $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Update,
        );
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemWritable($request, $collection, $item);

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
            return $this->updateBoardMove($request, $collection, $item);
        }

        if ($request->boolean('calendar_move')) {
            return $this->updateCalendarMove($request, $collection, $item);
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
     * Kanban drag: persist group field on published values + board_sort.
     * Versioned collections still update published so the board (which groups by
     * published values) reflects the drop; draft_data is patched when present.
     */
    private function updateBoardMove(
        UpdateCollectionItemRequest $request,
        Collection $collection,
        CollectionItem $item,
    ): RedirectResponse {
        $collection->loadMissing('fields');
        $incoming = $request->validated('data') ?? [];
        if (! is_array($incoming) || $incoming === []) {
            throw ValidationException::withMessages([
                'data' => [__('Board move requires a group field value.')],
            ]);
        }

        foreach (array_keys($incoming) as $key) {
            $field = $collection->fields->firstWhere('name', $key);
            if (
                ! $field instanceof CollectionField
                || ! in_array($field->type, [FieldTypeEnum::Select, FieldTypeEnum::RadioGroup], true)
            ) {
                throw ValidationException::withMessages([
                    "data.{$key}" => [__('Board move only allows select or radio group fields.')],
                ]);
            }
        }

        $this->permissionEnforcer->assertWritableFields($request, $collection, $incoming, 'update');

        $published = $this->collectionItemValuesAssembler->assemble($item);
        $preview = array_replace($published, $incoming);
        $incoming = $this->fieldConditionEvaluator->withoutReadonlyFields(
            $collection->fields,
            $preview,
            $incoming,
        );

        $data = $published;
        foreach ($incoming as $key => $value) {
            $data[$key] = $value;
        }

        $item = $this->updateCollectionItemAction->execute(new CollectionItemWriteData(
            collection: $collection,
            data: $data,
            item: $item,
            creating: false,
            version: 'published',
            shouldValidate: false,
            shouldMergeIncoming: false,
            shouldEnforceVersioningGuard: false,
            revisionMeta: ['source' => 'board_move'],
        ));

        if (is_array($item->draft_data)) {
            $draft = $item->draft_data;
            foreach ($incoming as $key => $value) {
                $draft[$key] = $value;
            }
            $item->draft_data = $this->itemDataNormalizer->normalize($collection, $draft, false);
        }

        $this->assignBoardSort(
            $item,
            $collection,
            $request->validated('after_item_id') !== null
                ? (int) $request->validated('after_item_id')
                : null,
            $request->validated('before_item_id') !== null
                ? (int) $request->validated('before_item_id')
                : null,
        );
        $item->save();

        return $this->redirectAfterItemSave(
            $collection,
            $item,
            $this->itemSaveAction($request),
            __('Item updated.'),
        );
    }

    /**
     * Calendar drag: persist date field on published values.
     * Versioned collections still update published so the calendar (which buckets
     * by published values) reflects the drop; draft_data is patched when present.
     * Datetime fields keep the existing clock when the client sends a bare Y-m-d.
     */
    private function updateCalendarMove(
        UpdateCollectionItemRequest $request,
        Collection $collection,
        CollectionItem $item,
    ): RedirectResponse {
        $collection->loadMissing('fields');
        $incoming = $request->validated('data') ?? [];
        if (! is_array($incoming) || $incoming === []) {
            throw ValidationException::withMessages([
                'data' => [__('Calendar move requires a date field value.')],
            ]);
        }

        foreach (array_keys($incoming) as $key) {
            $field = $collection->fields->firstWhere('name', $key);
            if (
                ! $field instanceof CollectionField
                || $field->type !== FieldTypeEnum::Date
            ) {
                throw ValidationException::withMessages([
                    "data.{$key}" => [__('Calendar move only allows date fields.')],
                ]);
            }
        }

        $this->permissionEnforcer->assertWritableFields($request, $collection, $incoming, 'update');

        $published = $this->collectionItemValuesAssembler->assemble($item);
        foreach ($incoming as $key => $value) {
            if (! is_string($value)) {
                continue;
            }
            $incoming[$key] = $this->calendarMoveDateValue(
                is_string($published[$key] ?? null) ? $published[$key] : null,
                $value,
            );
        }

        $preview = array_replace($published, $incoming);
        $incoming = $this->fieldConditionEvaluator->withoutReadonlyFields(
            $collection->fields,
            $preview,
            $incoming,
        );

        $data = $published;
        foreach ($incoming as $key => $value) {
            $data[$key] = $value;
        }

        $item = $this->updateCollectionItemAction->execute(new CollectionItemWriteData(
            collection: $collection,
            data: $data,
            item: $item,
            creating: false,
            version: 'published',
            shouldValidate: false,
            shouldMergeIncoming: false,
            shouldEnforceVersioningGuard: false,
            revisionMeta: ['source' => 'calendar_move'],
        ));

        if (is_array($item->draft_data)) {
            $draft = $item->draft_data;
            foreach ($incoming as $key => $value) {
                $draft[$key] = $value;
            }
            $item->draft_data = $this->itemDataNormalizer->normalize($collection, $draft, false);
            $item->save();
        }

        return $this->redirectAfterItemSave(
            $collection,
            $item,
            $this->itemSaveAction($request),
            __('Item updated.'),
        );
    }

    /**
     * Keep datetime clock when client sends a bare calendar day (Y-m-d).
     */
    private function calendarMoveDateValue(?string $existing, string $incoming): string
    {
        $trimmed = trim($incoming);
        if (
            preg_match('/^\d{4}-\d{2}-\d{2}$/', $trimmed) === 1
            && is_string($existing)
            && preg_match('/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/', $existing, $match) === 1
        ) {
            return $trimmed.'T'.$match[2];
        }

        return $trimmed;
    }

    /**
     * Place item immediately after `after_item_id` (or before `before_item_id`
     * when dropping at the top). Increments later ranks so equal/null neighbor
     * sorts cannot collapse the intended position.
     */
    private function assignBoardSort(
        CollectionItem $item,
        Collection $collection,
        ?int $afterItemId,
        ?int $beforeItemId,
    ): void {
        $after = null;
        if ($afterItemId !== null && $afterItemId !== $item->id) {
            $after = CollectionItem::query()
                ->where('collection_id', $collection->id)
                ->whereKey($afterItemId)
                ->first();
        }

        $before = null;
        if ($beforeItemId !== null && $beforeItemId !== $item->id) {
            $before = CollectionItem::query()
                ->where('collection_id', $collection->id)
                ->whereKey($beforeItemId)
                ->first();
        }

        if ($after !== null) {
            if ($after->board_sort === null) {
                $after->board_sort = 1000;
                $after->save();
            }
            $afterSort = (int) $after->board_sort;
            CollectionItem::query()
                ->where('collection_id', $collection->id)
                ->whereKeyNot($item->id)
                ->whereNotNull('board_sort')
                ->where('board_sort', '>', $afterSort)
                ->increment('board_sort', 1000);
            $item->board_sort = $afterSort + 1000;

            return;
        }

        if ($before !== null) {
            if ($before->board_sort === null) {
                $before->board_sort = 2000;
                $before->save();
            }
            $beforeSort = (int) $before->board_sort;
            CollectionItem::query()
                ->where('collection_id', $collection->id)
                ->whereKeyNot($item->id)
                ->whereNotNull('board_sort')
                ->where('board_sort', '>=', $beforeSort)
                ->increment('board_sort', 1000);
            $item->board_sort = $beforeSort;

            return;
        }

        $item->board_sort = 1000;
    }

    /**
     * Promote draft_data into published field values (content versioning).
     */
    public function publish(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Update,
        );
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemWritable($request, $collection, $item);
        abort_unless($collection->versioning, 422);

        if (! is_array($item->draft_data)) {
            return redirect()
                ->route('collections.items.show', [
                    'collection' => $collection,
                    'item' => $item,
                    'version' => 'draft',
                ])
                ->with('error', __('No draft changes to publish.'));
        }

        try {
            $this->itemPublisher->promote($item, $collection, scheduled: false);
        } catch (RuntimeException $e) {
            return redirect()
                ->route('collections.items.show', [
                    'collection' => $collection,
                    'item' => $item,
                    'version' => 'draft',
                ])
                ->with('error', __($e->getMessage()));
        }

        return redirect()->route('collections.items.show', [
            'collection' => $collection,
            'item' => $item,
            'version' => 'published',
        ])->with('success', __('Published.'));
    }

    /**
     * Submit draft for editorial review.
     */
    public function submitForReview(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Update,
        );
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemWritable($request, $collection, $item);

        /** @var User $user */
        $user = $request->user();
        $this->itemApprovals->submit($item, $collection, $user);

        return redirect()->route('collections.items.show', [
            'collection' => $collection,
            'item' => $item,
            'version' => 'draft',
        ])->with('success', __('Submitted for review.'));
    }

    /**
     * Approve a draft that is in review.
     */
    public function approve(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Update,
        );
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemWritable($request, $collection, $item);

        /** @var User $user */
        $user = $request->user();
        $this->itemApprovals->approve($item, $collection, $user);

        return redirect()->route('collections.items.show', [
            'collection' => $collection,
            'item' => $item,
            'version' => 'draft',
        ])->with('success', __('Approved.'));
    }

    /**
     * Reject a draft that is in review (note required).
     */
    public function reject(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Update,
        );
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemWritable($request, $collection, $item);

        $validated = $request->validate([
            'rejection_note' => ['required', 'string', 'max:5000'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $this->itemApprovals->reject($item, $collection, $user, $validated['rejection_note']);

        return redirect()->route('collections.items.show', [
            'collection' => $collection,
            'item' => $item,
            'version' => 'draft',
        ])->with('success', __('Rejected.'));
    }

    /**
     * Schedule publish and/or unpublish for a versioned item.
     */
    public function schedule(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Update,
        );
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemWritable($request, $collection, $item);
        abort_unless($collection->versioning, 422);

        $validated = $request->validate([
            'publish_at' => ['nullable', 'date'],
            'unpublish_at' => ['nullable', 'date'],
            'clear' => ['sometimes', 'boolean'],
        ]);

        $version = $request->query('version', 'draft');
        if (! in_array($version, ['published', 'draft'], true)) {
            $version = 'draft';
        }

        if ($request->boolean('clear')) {
            // Published workspace: only clear unpublish; keep draft promote schedule.
            if ($version === 'published') {
                $item->unpublish_at = null;
            } else {
                $item->publish_at = null;
                $item->unpublish_at = null;
                $item->clearScheduleFailure();
            }
            $item->save();

            return redirect()->route('collections.items.show', [
                'collection' => $collection,
                'item' => $item,
                'version' => $version,
            ])->with('success', __('Schedule cleared.'));
        }

        $touchPublish = $request->exists('publish_at');
        $touchUnpublish = $request->exists('unpublish_at');

        $publishAt = $touchPublish ? ($validated['publish_at'] ?? null) : $item->publish_at?->toIso8601String();
        $unpublishAt = $touchUnpublish ? ($validated['unpublish_at'] ?? null) : $item->unpublish_at?->toIso8601String();

        // Draft promote+unpublish pair only; published view schedules soft-delete alone.
        if (
            $version !== 'published'
            && $publishAt !== null
            && $unpublishAt !== null
            && strtotime((string) $unpublishAt) <= strtotime((string) $publishAt)
        ) {
            return redirect()
                ->back()
                ->with('error', __('Unpublish time must be after publish time.'));
        }

        if ($touchPublish && $publishAt !== null && ! is_array($item->draft_data)) {
            return redirect()
                ->route('collections.items.show', [
                    'collection' => $collection,
                    'item' => $item,
                    'version' => 'draft',
                ])
                ->with('error', __('Save a draft before scheduling publish.'));
        }

        if (
            $touchPublish
            && $publishAt !== null
            && $collection->approvals_required
            && (string) $item->approval_status !== 'approved'
        ) {
            return redirect()
                ->back()
                ->with('error', __('Item must be approved before scheduling publish.'));
        }

        // Published workspace never reschedules promote; only soft-delete unpublish.
        if ($version === 'published') {
            $item->unpublish_at = $touchUnpublish ? ($validated['unpublish_at'] ?? null) : $item->unpublish_at;
        } else {
            if ($touchPublish) {
                $item->publish_at = $validated['publish_at'] ?? null;
                $item->clearScheduleFailure();
            }
            if ($touchUnpublish) {
                $item->unpublish_at = $validated['unpublish_at'] ?? null;
            }
            // Legacy clients that always send both keys.
            if (! $touchPublish && ! $touchUnpublish) {
                $item->publish_at = $validated['publish_at'] ?? null;
                $item->unpublish_at = $validated['unpublish_at'] ?? null;
                $item->clearScheduleFailure();
            }
        }
        $item->save();

        return redirect()->route('collections.items.show', [
            'collection' => $collection,
            'item' => $item,
            'version' => $version,
        ])->with('success', __('Schedule saved.'));
    }

    /**
     * Discard unpublished draft_data (content versioning). Published values untouched.
     */
    public function discardDraft(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Update,
        );
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemWritable($request, $collection, $item);
        abort_unless($collection->versioning, 422);

        if (! is_array($item->draft_data)) {
            return redirect()
                ->route('collections.items.show', [
                    'collection' => $collection,
                    'item' => $item,
                    'version' => 'draft',
                ])
                ->with('error', __('No draft to discard.'));
        }

        $item->draft_data = null;
        $item->publish_at = null;
        $item->clearScheduleFailure();
        if ($collection->approvals_required) {
            $this->itemApprovals->resetToDraft($item);
        } else {
            $item->save();
        }

        $this->revisionRecorder->record($item, [
            'source' => 'discard_draft',
        ]);

        return redirect()->route('collections.items.show', [
            'collection' => $collection,
            'item' => $item,
            'version' => 'draft',
        ])->with('success', __('Draft discarded.'));
    }

    /**
     * Soft-delete a collection item.
     */
    public function destroy(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Delete,
        );
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemWritable($request, $collection, $item);

        $item->delete();

        return redirect()->route('collections.items.index', $collection)
            ->with('success', __('Item deleted.'));
    }

    /**
     * Restore a soft-deleted collection item.
     */
    public function restore(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Update,
        );
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
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Delete,
        );
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

        $collectionAction = match ($action) {
            'restore' => CollectionPermissionActionEnum::Update,
            default => CollectionPermissionActionEnum::Delete,
        };
        $this->permissionEnforcer->assertCollectionAction($request, $collection, $collectionAction);

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
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Read,
        );

        $validated = $request->validate([
            'field_id' => ['required', 'integer'],
            'related_collection_id' => ['nullable', 'integer', 'exists:collections,id'],
            'display_field' => ['nullable', 'string', 'max:64'],
            'search' => SearchQueryRules::search(),
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
            $return = SafeReturnUrl::from(request()->input('return'));
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
     * @return array<string, mixed>
     */
    private function parseStringFilters(Request $request): array
    {
        $filters = $request->query('filter', []);
        if (! is_array($filters)) {
            return [];
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

        return $stringFilters;
    }

    /**
     * @param  array<string, mixed>  $stringFilters
     * @return Builder<CollectionItem>
     */
    private function baseItemListQuery(
        Request $request,
        Collection $collection,
        array $stringFilters,
        bool $trashed,
        bool $hasDraft,
        bool $inReview,
    ): Builder {
        $query = CollectionItem::query()
            ->when($trashed, fn ($query) => $query->onlyTrashed())
            ->when($hasDraft, fn ($query) => $query->whereNotNull('draft_data'))
            ->when($inReview, fn ($query) => $query->where('approval_status', 'in_review'))
            ->where('collection_id', $collection->id)
            ->with([
                'fieldValues',
                'userCreated:id,first_name,last_name,email',
                'userUpdated:id,first_name,last_name,email',
                'collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()]),
            ]);
        $this->itemQueryService->applyFilters($query, $collection, $stringFilters);
        $this->permissionEnforcer->applyItemFilterToQuery($request, $collection, $query);

        return $query;
    }

    /**
     * @param  list<CollectionItem>  $items
     * @param  list<string>  $listColumns
     * @return list<array<string, mixed>>
     */
    private function mapItemRows(
        Request $request,
        Collection $collection,
        array $items,
        array $listColumns,
    ): array {
        $versioning = (bool) $collection->versioning;
        $approvalsRequired = (bool) $collection->approvals_required;
        $rows = array_map(function (CollectionItem $item) use ($request, $versioning, $approvalsRequired): array {
            $row = (new CollectionItemResource($item))->toArray($request);
            if ($versioning) {
                $row['has_draft'] = is_array($item->draft_data);
                $row['schedule_failed'] = $item->schedule_failed_at !== null;
            }
            if ($approvalsRequired) {
                $row['approval_status'] = $item->approval_status ?? 'draft';
            }

            return $row;
        }, $items);

        return $this->listDisplayEnricher->enrich($collection, $rows, $listColumns);
    }

    /**
     * @param  array<string, mixed>  $stringFilters
     * @param  list<string>  $listColumns
     * @return array{
     *     field: string,
     *     per_page: int,
     *     columns: list<array{value: string, label: string, total: int, current_page: int, last_page: int, items: list<array<string, mixed>>}>
     * }
     */
    private function buildKanbanBoard(
        Request $request,
        Collection $collection,
        string $fieldName,
        array $stringFilters,
        bool $trashed,
        bool $hasDraft,
        bool $inReview,
        ?string $sort,
        ?string $direction,
        array $listColumns,
    ): array {
        $field = $collection->fields->firstWhere('name', $fieldName);
        abort_unless($field instanceof CollectionField, 422);

        $columns = [];
        foreach ($this->kanbanColumnDefs($field) as $def) {
            $page = $this->paginateKanbanColumn(
                $request,
                $collection,
                $fieldName,
                $def['value'],
                $stringFilters,
                $trashed,
                $hasDraft,
                $inReview,
                $sort,
                $direction,
                $listColumns,
                self::KANBAN_PER_PAGE,
                1,
            );
            $columns[] = [
                'value' => $def['value'],
                'label' => $def['label'],
                'total' => $page['total'],
                'current_page' => $page['current_page'],
                'last_page' => $page['last_page'],
                'items' => $page['data'],
            ];
        }

        return [
            'field' => $fieldName,
            'per_page' => self::KANBAN_PER_PAGE,
            'columns' => $columns,
        ];
    }

    /**
     * @return list<array{value: string, label: string}>
     */
    private function kanbanColumnDefs(CollectionField $field): array
    {
        $settings = is_array($field->settings) ? $field->settings : [];
        $rawOptions = $settings['options'] ?? [];
        $options = [];
        if (is_array($rawOptions)) {
            foreach ($rawOptions as $option) {
                if (! is_array($option)) {
                    continue;
                }
                $value = isset($option['value']) ? trim((string) $option['value']) : '';
                if ($value === '') {
                    continue;
                }
                $label = isset($option['label']) ? trim((string) $option['label']) : '';
                $options[] = [
                    'value' => $value,
                    'label' => $label !== '' ? $label : $value,
                ];
            }
        }

        $allowNone = ($settings['allow_none'] ?? false) === true
            || ($settings['allow_none'] ?? null) === 1
            || ($settings['allow_none'] ?? null) === '1';

        $columns = [];
        if ($allowNone || $options === []) {
            $columns[] = ['value' => '', 'label' => 'No value'];
        }

        return [...$columns, ...$options];
    }

    /**
     * @param  array<string, mixed>  $stringFilters
     * @param  list<string>  $listColumns
     * @return array{
     *     data: list<array<string, mixed>>,
     *     current_page: int,
     *     last_page: int,
     *     per_page: int,
     *     total: int
     * }
     */
    private function paginateKanbanColumn(
        Request $request,
        Collection $collection,
        string $fieldName,
        string $columnValue,
        array $stringFilters,
        bool $trashed,
        bool $hasDraft,
        bool $inReview,
        ?string $sort,
        ?string $direction,
        array $listColumns,
        int $perPage,
        int $page,
    ): array {
        $query = $this->baseItemListQuery(
            $request,
            $collection,
            $stringFilters,
            $trashed,
            $hasDraft,
            $inReview,
        );

        $columnFilter = $columnValue === ''
            ? [$fieldName => ['_null' => true]]
            : [$fieldName => ['_eq' => $columnValue]];
        $this->itemQueryService->applyFilters($query, $collection, $columnFilter);
        $this->itemQueryService->applySort($query, $collection, $sort, $direction);

        $paginator = $query->paginate($perPage, ['*'], 'page', $page);
        $rows = $this->mapItemRows(
            $request,
            $collection,
            $paginator->getCollection()->all(),
            $listColumns,
        );

        return [
            'data' => $rows,
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
        ];
    }

    /**
     * Visible Sunday–Saturday grid covering `$month` (Y-m), including adjacent-month padding days.
     *
     * @return array{from: string, to: string}
     */
    private function calendarVisibleRange(string $month): array
    {
        abort_unless(preg_match('/^\d{4}-\d{2}$/', $month) === 1, 422, 'Invalid calendar month.');

        $start = Carbon::parse($month.'-01')->startOfMonth();
        $gridStart = $start->copy()->startOfWeek(Carbon::SUNDAY);
        $gridEnd = $start->copy()->endOfMonth()->endOfWeek(Carbon::SATURDAY);

        return [
            'from' => $gridStart->format('Y-m-d'),
            'to' => $gridEnd->format('Y-m-d'),
        ];
    }

    /**
     * @param  array<string, mixed>  $stringFilters
     * @param  list<string>  $listColumns
     * @return array{
     *     data: list<array<string, mixed>>,
     *     current_page: int,
     *     last_page: int,
     *     per_page: int,
     *     total: int
     * }
     */
    private function paginateCalendarMonth(
        Request $request,
        Collection $collection,
        string $fieldName,
        string $from,
        string $to,
        array $stringFilters,
        bool $trashed,
        bool $hasDraft,
        bool $inReview,
        ?string $sort,
        ?string $direction,
        array $listColumns,
        int $perPage,
        int $page,
    ): array {
        $field = $collection->fields->firstWhere('name', $fieldName);
        abort_unless(
            $field instanceof CollectionField && $field->type === FieldTypeEnum::Date,
            422,
            'field must be a date field.',
        );

        $query = $this->baseItemListQuery(
            $request,
            $collection,
            $stringFilters,
            $trashed,
            $hasDraft,
            $inReview,
        );
        $this->itemQueryService->applyDateFieldRange($query, $field, $from, $to);
        $this->itemQueryService->applySort($query, $collection, $sort, $direction);

        $paginator = $query->paginate($perPage, ['*'], 'page', $page);
        $rows = $this->mapItemRows(
            $request,
            $collection,
            $paginator->getCollection()->all(),
            $listColumns,
        );

        return [
            'data' => $rows,
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
        ];
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
     * @return 'table'|'kanban'|'calendar'
     */
    private function resolveListLayout(Request $request, Collection $collection): string
    {
        $queryLayout = $request->query('layout');
        if (in_array($queryLayout, ['table', 'kanban', 'calendar'], true)) {
            return $queryLayout;
        }

        $user = $request->user();
        $stored = $user !== null
            ? $this->settingsRepository->get(
                SettingsRepository::SCOPE_USER,
                'collection_list',
                'collection_'.$collection->id.'_layout',
                $user->id,
            )
            : null;

        return in_array($stored, ['table', 'kanban', 'calendar'], true) ? $stored : 'table';
    }

    private function resolveKanbanField(Request $request, Collection $collection): ?string
    {
        $user = $request->user();
        $stored = $user !== null
            ? $this->settingsRepository->get(
                SettingsRepository::SCOPE_USER,
                'collection_list',
                'collection_'.$collection->id.'_kanban_field',
                $user->id,
            )
            : null;

        $candidate = is_string($stored) && $stored !== '' ? $stored : null;
        $fields = $collection->fields ?? collect();

        if ($candidate !== null) {
            $field = $fields->firstWhere('name', $candidate);
            if (
                $field instanceof CollectionField
                && in_array($field->type, [FieldTypeEnum::Select, FieldTypeEnum::RadioGroup], true)
            ) {
                return $candidate;
            }
        }

        $first = $fields->first(
            fn (CollectionField $field): bool => in_array(
                $field->type,
                [FieldTypeEnum::Select, FieldTypeEnum::RadioGroup],
                true,
            ),
        );

        return $first instanceof CollectionField ? $first->name : null;
    }

    private function resolveCalendarField(Request $request, Collection $collection): ?string
    {
        $user = $request->user();
        $stored = $user !== null
            ? $this->settingsRepository->get(
                SettingsRepository::SCOPE_USER,
                'collection_list',
                'collection_'.$collection->id.'_calendar_field',
                $user->id,
            )
            : null;

        $candidate = is_string($stored) && $stored !== '' ? $stored : null;
        $fields = $collection->fields ?? collect();

        if ($candidate !== null) {
            $field = $fields->firstWhere('name', $candidate);
            if ($field instanceof CollectionField && $field->type === FieldTypeEnum::Date) {
                return $candidate;
            }
        }

        $first = $fields->first(
            fn (CollectionField $field): bool => $field->type === FieldTypeEnum::Date,
        );

        return $first instanceof CollectionField ? $first->name : null;
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

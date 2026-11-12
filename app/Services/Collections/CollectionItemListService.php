<?php

declare(strict_types=1);

namespace App\Services\Collections;

use App\Enums\FieldTypeEnum;
use App\Http\Requests\Collections\ListCalendarMonthItemsRequest;
use App\Http\Resources\CollectionItemResource;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Settings\SettingsRepositoryService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;

/**
 * Read side of the admin item list: the table, kanban and calendar layouts of
 * `collections/items/index` and the kanban column / calendar month JSON pages.
 *
 * Every layout starts from the same base query (trashed / draft / review toggles,
 * list filters, then the role's item filter from the permission enforcer), so the
 * three views and their lazy-loaded pages always show the same set of items.
 */
class CollectionItemListService
{
    /** First page size per kanban column (scroll fetches the next page). */
    public const KANBAN_PER_PAGE = 30;

    /** Hard cap for one calendar month fetch (visible grid + overflow notice). */
    public const CALENDAR_MAX_PER_PAGE = ListCalendarMonthItemsRequest::MAX_PER_PAGE;

    public function __construct(
        private CollectionItemQueryService $itemQueryService,
        private CollectionListColumnsNormalizerService $listColumnsNormalizer,
        private CollectionListDisplayEnricherService $listDisplayEnricher,
        private SettingsRepositoryService $settingsRepository,
        private CollectionPermissionEnforcerService $permissionEnforcer,
    ) {}

    /**
     * Props of the `collections/items/index` page for a non-singleton collection
     * whose ordered fields are already loaded.
     *
     * @param  int  $perPage  Table page size (already validated by the controller).
     * @return array<string, mixed>
     */
    public function indexProps(Request $request, Collection $collection, int $perPage): array
    {
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

            $paginator = $query->paginate($perPage)->withQueryString();
            $rows = $this->mapItemRows(
                $request,
                $collection,
                $paginator->getCollection()->all(),
                $listColumns,
            );
            $paginator->setCollection(collect($rows));
        }

        return [
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
        ];
    }

    /**
     * The `filter[...]` query bag, keeping only string keys with scalar, array or null values.
     *
     * @return array<string, mixed>
     */
    public function parseStringFilters(Request $request): array
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
        $this->itemQueryService->applyFilters($query, $collection, $stringFilters, null, $request);
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
    public function paginateKanbanColumn(
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
    public function paginateCalendarMonth(
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
    public function resolveListColumns(Request $request, Collection $collection): array
    {
        $user = $request->user();
        $stored = $user !== null
            ? $this->settingsRepository->get(
                SettingsRepositoryService::SCOPE_USER,
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
                SettingsRepositoryService::SCOPE_USER,
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
                SettingsRepositoryService::SCOPE_USER,
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
                SettingsRepositoryService::SCOPE_USER,
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
            SettingsRepositoryService::SCOPE_USER,
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
}

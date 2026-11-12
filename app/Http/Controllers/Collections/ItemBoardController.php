<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Enums\FieldTypeEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\ListCalendarMonthItemsRequest;
use App\Http\Requests\Collections\ListKanbanColumnItemsRequest;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Collections\CollectionItemListService;
use Illuminate\Http\JsonResponse;

/**
 * JSON pages the kanban and calendar layouts of the item list fetch lazily
 * (next cards of one column, items of another month). Authorization is in the
 * FormRequests; the queries are the item list's, so filters, search and the
 * role's item filter match the page they extend.
 */
class ItemBoardController extends Controller
{
    public function __construct(
        private CollectionItemListService $itemListService,
    ) {}

    /**
     * Items for one calendar date range (same filters/search/permissions as the list).
     */
    public function calendarMonth(ListCalendarMonthItemsRequest $request, Collection $collection): JsonResponse
    {
        $collection->load(['fields' => fn ($q) => $q->ordered()]);

        $validated = $request->validated();

        $fieldName = $validated['field'];
        $field = $collection->fields->firstWhere('name', $fieldName);
        abort_unless(
            $field instanceof CollectionField && $field->type === FieldTypeEnum::Date,
            422,
            'field must be a date field.',
        );

        $stringFilters = $this->itemListService->parseStringFilters($request);
        $trashed = $request->boolean('trashed');
        $hasDraft = $collection->versioning && $request->boolean('has_draft');
        $inReview = $collection->approvals_required && $request->boolean('in_review');
        $sortParam = $request->query('sort');
        $directionParam = $request->query('direction');
        $sort = is_string($sortParam) && $sortParam !== '' ? $sortParam : null;
        $direction = is_string($directionParam) && $directionParam !== ''
            ? $directionParam
            : null;

        $perPage = (int) ($validated['per_page'] ?? CollectionItemListService::CALENDAR_MAX_PER_PAGE);
        $page = (int) ($validated['page'] ?? 1);

        $payload = $this->itemListService->paginateCalendarMonth(
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
            $this->itemListService->resolveListColumns($request, $collection),
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
    public function kanbanColumn(ListKanbanColumnItemsRequest $request, Collection $collection): JsonResponse
    {
        $collection->load(['fields' => fn ($q) => $q->ordered()]);

        $validated = $request->validated();

        $fieldName = $validated['field'];
        $field = $collection->fields->firstWhere('name', $fieldName);
        abort_unless(
            $field instanceof CollectionField
            && in_array($field->type, [FieldTypeEnum::Select, FieldTypeEnum::RadioGroup], true),
            422,
            'field must be a select or radio field.',
        );

        $stringFilters = $this->itemListService->parseStringFilters($request);
        $trashed = $request->boolean('trashed');
        $hasDraft = $collection->versioning && $request->boolean('has_draft');
        $inReview = $collection->approvals_required && $request->boolean('in_review');
        $sortParam = $request->query('sort');
        $directionParam = $request->query('direction');
        $sort = is_string($sortParam) && $sortParam !== '' ? $sortParam : 'board_sort';
        $direction = is_string($directionParam) && $directionParam !== ''
            ? $directionParam
            : 'asc';

        $perPage = (int) ($validated['per_page'] ?? CollectionItemListService::KANBAN_PER_PAGE);
        $page = (int) ($validated['page'] ?? 1);
        $columnValue = isset($validated['value']) ? (string) $validated['value'] : '';

        $payload = $this->itemListService->paginateKanbanColumn(
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
            $this->itemListService->resolveListColumns($request, $collection),
            $perPage,
            $page,
        );

        return response()->json($payload);
    }
}

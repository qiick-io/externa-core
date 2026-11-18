<?php

declare(strict_types=1);

namespace App\Actions\Collections;

use App\Data\Collections\CollectionItemWriteData;
use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Collections\CollectionItemDataNormalizerService;
use App\Services\Collections\CollectionItemValuesAssemblerService;
use App\Services\Collections\FieldConditionEvaluatorService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Kanban and calendar drag-and-drop: write the moved field to the published values.
 *
 * Versioned collections still update published values so the board and the calendar
 * (which group / bucket by published values) reflect the drop; `draft_data` is patched
 * when present. A kanban move also re-ranks `board_sort`; a calendar move keeps the
 * existing clock of a datetime value when the client sends a bare Y-m-d day.
 */
final class MoveCollectionItemAction
{
    /** Revision source of a kanban drag (select / radio group field). */
    public const SOURCE_BOARD = 'board_move';

    /** Revision source of a calendar drag (date field). */
    public const SOURCE_CALENDAR = 'calendar_move';

    public function __construct(
        private UpdateCollectionItemAction $updateCollectionItemAction,
        private CollectionPermissionEnforcerService $permissionEnforcer,
        private CollectionItemValuesAssemblerService $collectionItemValuesAssembler,
        private CollectionItemDataNormalizerService $itemDataNormalizer,
        private FieldConditionEvaluatorService $fieldConditionEvaluator,
    ) {}

    /**
     * Persist the moved field values (and, for a board move, the new board position).
     *
     * @param  mixed  $incoming  Validated `data` payload: the moved field name => new value
     * @param  self::SOURCE_*  $source
     *
     * @throws ValidationException when the payload is empty or names a field of the wrong type
     */
    public function execute(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        mixed $incoming,
        string $source,
        ?int $afterItemId = null,
        ?int $beforeItemId = null,
    ): CollectionItem {
        $isCalendarMove = $source === self::SOURCE_CALENDAR;

        $collection->loadMissing('fields');
        if (! is_array($incoming) || $incoming === []) {
            throw ValidationException::withMessages([
                'data' => [$isCalendarMove
                    ? __('Calendar move requires a date field value.')
                    : __('Board move requires a group field value.')],
            ]);
        }

        $this->assertMovableFields($collection, $incoming, $isCalendarMove);

        $this->permissionEnforcer->assertWritableFields($request, $collection, $incoming, 'update');

        $published = $this->collectionItemValuesAssembler->assemble($item);

        if ($isCalendarMove) {
            foreach ($incoming as $key => $value) {
                if (! is_string($value)) {
                    continue;
                }
                $incoming[$key] = $this->calendarMoveDateValue(
                    is_string($published[$key] ?? null) ? $published[$key] : null,
                    $value,
                );
            }
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
            revisionMeta: ['source' => $source],
        ));

        $hasDraft = is_array($item->draft_data);
        if ($hasDraft) {
            $draft = $item->draft_data;
            foreach ($incoming as $key => $value) {
                $draft[$key] = $value;
            }
            $item->draft_data = $this->itemDataNormalizer->normalize($collection, $draft, false);
        }

        if ($isCalendarMove) {
            if ($hasDraft) {
                $item->save();
            }

            return $item;
        }

        $this->assignBoardSort($item, $collection, $afterItemId, $beforeItemId);
        $item->save();

        return $item;
    }

    /**
     * A board move may only target select / radio group fields, a calendar move only date fields.
     *
     * @param  array<array-key, mixed>  $incoming
     *
     * @throws ValidationException
     */
    private function assertMovableFields(Collection $collection, array $incoming, bool $isCalendarMove): void
    {
        foreach (array_keys($incoming) as $key) {
            $field = $collection->fields->firstWhere('name', $key);
            $isMovableField = $field instanceof CollectionField && ($isCalendarMove
                ? $field->type === FieldTypeEnum::Date
                : in_array($field->type, [FieldTypeEnum::Select, FieldTypeEnum::RadioGroup], true));

            if (! $isMovableField) {
                throw ValidationException::withMessages([
                    "data.{$key}" => [$isCalendarMove
                        ? __('Calendar move only allows date fields.')
                        : __('Board move only allows select or radio group fields.')],
                ]);
            }
        }
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
        CollectionItem::query()->getConnection()->transaction(function () use ($item, $collection, $afterItemId, $beforeItemId): void {
            $after = null;
            if ($afterItemId !== null && $afterItemId !== $item->id) {
                $after = CollectionItem::query()
                    ->where('collection_id', $collection->id)
                    ->whereKey($afterItemId)
                    ->lockForUpdate()
                    ->first();
            }

            $before = null;
            if ($beforeItemId !== null && $beforeItemId !== $item->id) {
                $before = CollectionItem::query()
                    ->where('collection_id', $collection->id)
                    ->whereKey($beforeItemId)
                    ->lockForUpdate()
                    ->first();
            }

            CollectionItem::query()
                ->where('collection_id', $collection->id)
                ->whereKey($item->id)
                ->lockForUpdate()
                ->first();

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
        });
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Requests\Collections;

use App\Enums\CollectionPermissionActionEnum;
use App\Http\Requests\Concerns\AuthorizesCollectionRouteAccessTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the calendar view's date-range query (`field`, `from`, `to`, paging).
 *
 * The calendar loads one visible range at a time; `to` may not precede `from`, and a page
 * holds at most {@see self::MAX_PER_PAGE} items so a month never needs a second round trip.
 */
class ListCalendarMonthItemsRequest extends FormRequest
{
    use AuthorizesCollectionRouteAccessTrait;

    /** Largest page the calendar may request (also its default page size). */
    public const MAX_PER_PAGE = 500;

    /**
     * Collection read grant (403), then singleton collections have no list (404).
     */
    public function authorize(): bool
    {
        $this->authorizeCollectionAction(CollectionPermissionActionEnum::Read);
        abort_if($this->routeCollection()->is_singleton, 404);

        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'field' => ['required', 'string', 'max:64'],
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ];
    }
}

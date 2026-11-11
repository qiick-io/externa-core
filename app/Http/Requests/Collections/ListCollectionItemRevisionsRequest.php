<?php

declare(strict_types=1);

namespace App\Http\Requests\Collections;

use App\Http\Requests\Concerns\AuthorizesCollectionRouteAccessTrait;
use App\Services\Api\CollectionPermissionEnforcerService;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the item revision history query: paging and an optional date range.
 */
class ListCollectionItemRevisionsRequest extends FormRequest
{
    use AuthorizesCollectionRouteAccessTrait;

    /** Largest revision page a client may request. */
    public const MAX_PER_PAGE = 100;

    /**
     * Item in the collection (404), then inside the actor's read filter (404).
     */
    public function authorize(): bool
    {
        abort_unless((int) $this->routeItem()->collection_id === (int) $this->routeCollection()->id, 404);
        app(CollectionPermissionEnforcerService::class)->assertItemReadable(
            $this,
            $this->routeCollection(),
            $this->routeItem(),
        );

        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
        ];
    }
}

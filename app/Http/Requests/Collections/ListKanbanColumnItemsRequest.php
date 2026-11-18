<?php

declare(strict_types=1);

namespace App\Http\Requests\Collections;

use App\Enums\CollectionPermissionActionEnum;
use App\Http\Requests\Concerns\AuthorizesCollectionRouteAccessTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the kanban board's per-column paging query (`field`, column `value`, paging).
 *
 * Each column loads independently, at most 50 cards per page.
 */
class ListKanbanColumnItemsRequest extends FormRequest
{
    use AuthorizesCollectionRouteAccessTrait;

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
            'value' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ];
    }
}

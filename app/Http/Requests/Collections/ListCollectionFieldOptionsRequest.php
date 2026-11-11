<?php

declare(strict_types=1);

namespace App\Http\Requests\Collections;

use App\Enums\CollectionPermissionActionEnum;
use App\Http\Requests\Concerns\AuthorizesCollectionRouteAccessTrait;
use App\Support\Validation\SearchQueryRules;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the relational field picker query: which field, optional target collection and
 * display field overrides, search and paging (at most 100 options per page).
 */
class ListCollectionFieldOptionsRequest extends FormRequest
{
    use AuthorizesCollectionRouteAccessTrait;

    /**
     * Collection read grant (403).
     */
    public function authorize(): bool
    {
        $this->authorizeCollectionAction(CollectionPermissionActionEnum::Read);

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'field_id' => ['required', 'integer'],
            'related_collection_id' => ['nullable', 'integer', 'exists:collections,id'],
            'display_field' => ['nullable', 'string', 'max:64'],
            'search' => SearchQueryRules::search(),
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ];
    }
}

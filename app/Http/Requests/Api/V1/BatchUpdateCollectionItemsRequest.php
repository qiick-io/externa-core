<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\CollectionPermissionActionEnum;
use App\Http\Requests\Concerns\AuthorizesApiCollectionBatchTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates `PATCH /api/v1/collections/{slug}/items/batch`: a bounded list of `{id, data}` entries.
 *
 * Only the envelope is validated here; each entry's `data` goes through the item update action,
 * which reports per-entry errors in the batch response instead of failing the whole call.
 */
class BatchUpdateCollectionItemsRequest extends FormRequest
{
    use AuthorizesApiCollectionBatchTrait;

    /**
     * Unknown slug (404), missing update grant or key scope (403).
     */
    public function authorize(): bool
    {
        $this->authorizeBatchAction(CollectionPermissionActionEnum::Update);

        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'items' => ['required', 'array', 'min:1', 'max:'.$this->maxBatchSize()],
            'items.*' => ['required', 'array'],
            'items.*.id' => ['required', 'integer', 'min:1'],
            'items.*.data' => ['nullable', 'array'],
        ];
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\CollectionPermissionActionEnum;
use App\Http\Requests\Concerns\AuthorizesApiCollectionBatchTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates `DELETE /api/v1/collections/{slug}/items/batch`: a bounded list of distinct item ids.
 */
class BatchDestroyCollectionItemsRequest extends FormRequest
{
    use AuthorizesApiCollectionBatchTrait;

    /**
     * Unknown slug (404), missing delete grant or key scope (403).
     */
    public function authorize(): bool
    {
        $this->authorizeBatchAction(CollectionPermissionActionEnum::Delete);

        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'ids' => ['required', 'array', 'min:1', 'max:'.$this->maxBatchSize()],
            'ids.*' => ['required', 'integer', 'min:1', 'distinct'],
        ];
    }
}

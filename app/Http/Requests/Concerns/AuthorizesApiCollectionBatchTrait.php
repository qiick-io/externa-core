<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Enums\CollectionPermissionActionEnum;
use App\Http\Controllers\Api\V1\Concerns\AuthorizesCollectionAccessTrait;
use App\Models\Collection;

/**
 * Collection gate and batch size limit shared by the public API batch item requests.
 *
 * The API answers an unknown `{slug}` with 404 and a missing grant or key scope with 403 before
 * it looks at the payload, so both checks run in `authorize()`, ahead of validation.
 */
trait AuthorizesApiCollectionBatchTrait
{
    use AuthorizesCollectionAccessTrait;

    private ?Collection $authorizedCollection = null;

    /**
     * The `{slug}` collection resolved and authorized in `authorize()`.
     */
    public function collection(): Collection
    {
        return $this->authorizedCollection ??= $this->findCollectionBySlug((string) $this->route('slug'));
    }

    /**
     * Abort with 404 for an unknown slug and 403 unless role ACL ∩ key scopes allow the action.
     */
    protected function authorizeBatchAction(CollectionPermissionActionEnum $action): void
    {
        $this->authorizeCollection($this, $this->collection(), $action);
    }

    /**
     * Most items one batch call may carry (`api.max_batch_size`, at least 1).
     */
    protected function maxBatchSize(): int
    {
        return max(1, (int) config('api.max_batch_size', 100));
    }
}

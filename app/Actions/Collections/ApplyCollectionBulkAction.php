<?php

declare(strict_types=1);

namespace App\Actions\Collections;

use App\Models\Collection;

/**
 * Run a bulk delete (soft), restore or force-delete on the selected collections.
 * Restore and force-delete only touch collections that are already in the trash.
 */
final class ApplyCollectionBulkAction
{
    /**
     * @param  'delete'|'restore'|'force_delete'  $action
     * @param  array<int, int|string>  $ids
     */
    public function execute(string $action, array $ids): void
    {
        match ($action) {
            'delete' => Collection::query()->whereIn('id', $ids)->delete(),
            'restore' => Collection::query()->onlyTrashed()->whereIn('id', $ids)->restore(),
            'force_delete' => Collection::query()->onlyTrashed()->whereIn('id', $ids)->forceDelete(),
        };
    }
}

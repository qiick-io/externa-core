<?php

namespace App\Services\Api;

use App\Enums\CollectionPermissionAction;
use App\Models\CollectionPermission;
use Illuminate\Support\Facades\Cache;

/**
 * Resolves per-collection CRUD access for a role. Absence of a grant = deny.
 */
class CollectionPermissionGuard
{
    private const CACHE_TTL_SECONDS = 300;

    public function allows(int $roleId, int $collectionId, CollectionPermissionAction|string $action): bool
    {
        $actionValue = $action instanceof CollectionPermissionAction ? $action->value : $action;
        $matrix = $this->matrixForRole($roleId);

        return (bool) ($matrix[$collectionId][$actionValue] ?? false);
    }

    /**
     * @return array<int, array<string, bool>>
     */
    public function matrixForRole(int $roleId): array
    {
        return Cache::remember(
            $this->cacheKey($roleId),
            self::CACHE_TTL_SECONDS,
            function () use ($roleId): array {
                $rows = CollectionPermission::query()
                    ->where('role_id', $roleId)
                    ->where('allowed', true)
                    ->get(['collection_id', 'action']);

                $matrix = [];
                foreach ($rows as $row) {
                    $action = $row->action instanceof CollectionPermissionAction
                        ? $row->action->value
                        : (string) $row->action;
                    $matrix[(int) $row->collection_id][$action] = true;
                }

                return $matrix;
            }
        );
    }

    public function forget(int $roleId): void
    {
        Cache::forget($this->cacheKey($roleId));
    }

    private function cacheKey(int $roleId): string
    {
        return 'collection_permissions.role.'.$roleId;
    }
}

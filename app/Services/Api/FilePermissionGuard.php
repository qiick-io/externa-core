<?php

namespace App\Services\Api;

use App\Enums\FilePermissionAction;
use App\Models\FilePermission;
use Illuminate\Support\Facades\Cache;

/**
 * Resolves global file CRUD access for a role. Absence of a grant = deny.
 */
class FilePermissionGuard
{
    private const CACHE_TTL_SECONDS = 300;

    public function allows(int $roleId, FilePermissionAction|string $action): bool
    {
        $actionValue = $action instanceof FilePermissionAction ? $action->value : $action;
        $grants = $this->grantsForRole($roleId);

        return (bool) ($grants[$actionValue] ?? false);
    }

    /**
     * @return array<string, bool>
     */
    public function grantsForRole(int $roleId): array
    {
        return Cache::remember(
            $this->cacheKey($roleId),
            self::CACHE_TTL_SECONDS,
            function () use ($roleId): array {
                $rows = FilePermission::query()
                    ->where('role_id', $roleId)
                    ->where('allowed', true)
                    ->get(['action']);

                $grants = [];
                foreach ($rows as $row) {
                    $action = $row->action instanceof FilePermissionAction
                        ? $row->action->value
                        : (string) $row->action;
                    $grants[$action] = true;
                }

                return $grants;
            }
        );
    }

    public function forget(int $roleId): void
    {
        Cache::forget($this->cacheKey($roleId));
    }

    private function cacheKey(int $roleId): string
    {
        return 'file_permissions.role.'.$roleId;
    }
}

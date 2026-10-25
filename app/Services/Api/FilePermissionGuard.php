<?php

namespace App\Services\Api;

use App\Enums\FileAccess;
use App\Enums\FilePermissionAction;
use App\Models\File;
use App\Models\FilePermission;
use Illuminate\Database\Eloquent\Builder;
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
     * Whether the role may read this file's metadata/content/expansion.
     * Requires `read`; private effective access also requires `read_private`.
     */
    public function canReadFile(int $roleId, File $file): bool
    {
        if (! $this->allows($roleId, FilePermissionAction::Read)) {
            return false;
        }

        if (! $file->isEffectivelyPrivate()) {
            return true;
        }

        return $this->allows($roleId, FilePermissionAction::ReadPrivate);
    }

    /**
     * Restrict a files query to rows the role may see when listing.
     * Admin / roles with read_private see everything.
     *
     * @param  Builder<File>  $query
     * @return Builder<File>
     */
    public function constrainReadable(Builder $query, int $roleId): Builder
    {
        if ($this->allows($roleId, FilePermissionAction::ReadPrivate)) {
            return $query;
        }

        $hiddenIds = $this->effectivelyPrivateIds();
        if ($hiddenIds === []) {
            return $query;
        }

        return $query->whereNotIn('id', $hiddenIds);
    }

    /**
     * @return list<int>
     */
    public function effectivelyPrivateIds(): array
    {
        // ponytail: load id/parent/access for all files (ceiling: very large libraries → denormalize effective_access)
        $rows = File::query()
            ->toBase()
            ->get(['id', 'parent_id', 'access']);

        $byId = [];
        foreach ($rows as $row) {
            $byId[(int) $row->id] = [
                'parent_id' => $row->parent_id !== null ? (int) $row->parent_id : null,
                'access' => is_string($row->access) && $row->access !== ''
                    ? $row->access
                    : null,
            ];
        }

        $memo = [];
        $resolve = function (int $id) use (&$resolve, &$memo, $byId): string {
            if (isset($memo[$id])) {
                return $memo[$id];
            }

            $row = $byId[$id] ?? null;
            if ($row === null) {
                return $memo[$id] = FileAccess::Public->value;
            }

            if ($row['access'] !== null) {
                return $memo[$id] = $row['access'];
            }

            if ($row['parent_id'] === null) {
                return $memo[$id] = FileAccess::Public->value;
            }

            return $memo[$id] = $resolve($row['parent_id']);
        };

        $private = [];
        foreach (array_keys($byId) as $id) {
            if ($resolve($id) === FileAccess::Private->value) {
                $private[] = $id;
            }
        }

        return $private;
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

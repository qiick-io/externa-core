<?php

namespace App\Services\Api;

use App\Enums\FileAccessEnum;
use App\Enums\FilePermissionActionEnum;
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

    public function allows(int $roleId, FilePermissionActionEnum|string $action): bool
    {
        $actionValue = $action instanceof FilePermissionActionEnum ? $action->value : $action;
        $grants = $this->grantsForRole($roleId);

        return (bool) ($grants[$actionValue] ?? false);
    }

    /**
     * Whether the role may read this file's metadata/content/expansion.
     * Requires `read`; private effective access also requires `read_private`.
     */
    public function canReadFile(int $roleId, File $file): bool
    {
        if (! $this->allows($roleId, FilePermissionActionEnum::Read)) {
            return false;
        }

        if (! $file->isEffectivelyPrivate()) {
            return true;
        }

        return $this->allows($roleId, FilePermissionActionEnum::ReadPrivate);
    }

    /**
     * Restrict a files query to rows the role may see when listing.
     * Admin / roles with read_private see everything.
     *
     * Uses denormalized `effective_access` (no full-tree load).
     *
     * @param  Builder<File>  $query
     * @return Builder<File>
     */
    public function constrainReadable(Builder $query, int $roleId): Builder
    {
        if ($this->allows($roleId, FilePermissionActionEnum::ReadPrivate)) {
            return $query;
        }

        return $query->where(function (Builder $nested): void {
            $nested->where('effective_access', '!=', FileAccessEnum::Private->value)
                ->orWhereNull('effective_access');
        });
    }

    /**
     * @return list<int>
     */
    public function effectivelyPrivateIds(): array
    {
        return File::query()
            ->where('effective_access', FileAccessEnum::Private->value)
            ->pluck('id')
            ->map(fn ($id): int => (int) $id)
            ->all();
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
                    $action = $row->action instanceof FilePermissionActionEnum
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

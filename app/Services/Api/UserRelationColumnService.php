<?php

declare(strict_types=1);

namespace App\Services\Api;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

/**
 * Column list for eager-loading users on API payloads during the public_id deploy window (#827).
 *
 * Mid-upgrade code may run before `users.public_id` exists; omit that column until migrate finishes.
 * Presence is memoised per process and in the file cache across requests (not Redis — deploy-window
 * probes must not depend on Redis being up); {@see forgetPublicIdColumnCache()} clears both.
 */
final class UserRelationColumnService
{
    private const string CACHE_KEY = 'schema.columns.users.public_id';

    private const string CACHE_STORE = 'file';

    private static ?bool $hasPublicIdColumn = null;

    /**
     * @return list<string>
     */
    public function selectColumns(): array
    {
        // deleted_at is required so MiniUser can omit soft-deleted users without a MissingAttributeException.
        $columns = ['id', 'first_name', 'last_name', 'email', 'deleted_at'];

        if ($this->hasPublicIdColumn()) {
            array_splice($columns, 1, 0, ['public_id']);
        }

        return $columns;
    }

    /**
     * Comma-separated select for BelongsTo `with()` / `loadMissing()` constraints.
     */
    public function selectList(): string
    {
        return implode(',', $this->selectColumns());
    }

    /**
     * Whether `users.public_id` exists.
     *
     * @throws \Throwable when the schema probe fails (DB unreachable); never treat that as "missing".
     */
    public function hasPublicIdColumn(): bool
    {
        if (self::$hasPublicIdColumn !== null) {
            return self::$hasPublicIdColumn;
        }

        $cached = Cache::store(self::CACHE_STORE)->get(self::CACHE_KEY);

        if (is_bool($cached)) {
            return self::$hasPublicIdColumn = $cached;
        }

        $exists = Schema::hasColumn('users', 'public_id');
        Cache::store(self::CACHE_STORE)->forever(self::CACHE_KEY, $exists);

        return self::$hasPublicIdColumn = $exists;
    }

    public static function forgetPublicIdColumnCache(): void
    {
        self::$hasPublicIdColumn = null;
        Cache::store(self::CACHE_STORE)->forget(self::CACHE_KEY);
    }
}

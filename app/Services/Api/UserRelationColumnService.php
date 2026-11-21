<?php

declare(strict_types=1);

namespace App\Services\Api;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

/**
 * Column list for eager-loading users on API payloads during the public_id deploy window (#827).
 *
 * Mid-upgrade code may run before `users.public_id` exists; omit that column until migrate finishes.
 * Only a positive probe is memoised (per process and in the file cache across requests): a shared
 * "missing" result must not stick across parallel Pest workers or long-lived processes that later
 * see the column after migrate. {@see forgetPublicIdColumnCache()} clears both.
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
        if (self::$hasPublicIdColumn === true) {
            return true;
        }

        if (Cache::store(self::CACHE_STORE)->get(self::CACHE_KEY) === true) {
            return self::$hasPublicIdColumn = true;
        }

        $exists = Schema::hasColumn('users', 'public_id');

        if ($exists) {
            self::$hasPublicIdColumn = true;
            Cache::store(self::CACHE_STORE)->forever(self::CACHE_KEY, true);
        }

        return $exists;
    }

    public static function forgetPublicIdColumnCache(): void
    {
        self::$hasPublicIdColumn = null;
        Cache::store(self::CACHE_STORE)->forget(self::CACHE_KEY);
    }
}

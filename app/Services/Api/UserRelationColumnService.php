<?php

declare(strict_types=1);

namespace App\Services\Api;

use Illuminate\Support\Facades\Schema;

/**
 * Column list for eager-loading users on API payloads during the public_id deploy window (#827).
 *
 * Mid-upgrade code may run before `users.public_id` exists; omit that column until migrate finishes.
 */
final class UserRelationColumnService
{
    private static ?bool $hasPublicIdColumn = null;

    /**
     * @return list<string>
     */
    public function selectColumns(): array
    {
        $columns = ['id', 'first_name', 'last_name', 'email'];

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
     * Only the positive result is memoised: before the column exists we re-probe so a long-lived
     * worker that saw "missing" still notices it after migrate (upgrade also calls forget).
     *
     * Schema probes are swallowed when the database is unreachable (PHPStan / lint without sqlite).
     */
    public function hasPublicIdColumn(): bool
    {
        if (self::$hasPublicIdColumn === true) {
            return true;
        }

        try {
            if (Schema::hasColumn('users', 'public_id')) {
                self::$hasPublicIdColumn = true;

                return true;
            }
        } catch (\Throwable) {
            return false;
        }

        return false;
    }

    public static function forgetPublicIdColumnCache(): void
    {
        self::$hasPublicIdColumn = null;
    }
}

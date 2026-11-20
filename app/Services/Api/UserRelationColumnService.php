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

    public function hasPublicIdColumn(): bool
    {
        return self::$hasPublicIdColumn ??= Schema::hasColumn('users', 'public_id');
    }

    public static function forgetPublicIdColumnCache(): void
    {
        self::$hasPublicIdColumn = null;
    }
}

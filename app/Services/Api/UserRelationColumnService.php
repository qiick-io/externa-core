<?php

declare(strict_types=1);

namespace App\Services\Api;

use Illuminate\Support\Facades\Schema;

/**
 * Column list for eager-loading users on API payloads during the public_id deploy window (#827).
 *
 * Mid-upgrade code may run before `users.public_id` exists; omit that column until migrate finishes.
 * The missing-column fallbacks (uniqueIds empty, select without public_id, create without the
 * attribute) are temporary until v2 removes the bigint/public_id dual surface and the deploy window.
 *
 * The column probe is memoised only for the current request or queue job (scoped binding; Octane
 * and the queue worker flush scoped instances between units of work). Never use a cross-process
 * cache: a restored pre-upgrade backup would keep a stale "column exists" and 500 on every write.
 * {@see forgetPublicIdColumnCache()} clears the in-request memo (migrations / upgrade / tests).
 */
final class UserRelationColumnService
{
    private ?bool $hasPublicIdColumn = null;

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
        return $this->hasPublicIdColumn ??= Schema::hasColumn('users', 'public_id');
    }

    /**
     * Clear the in-request / in-job memo (upgrade after migrate; tests; unknown-column retry).
     */
    public function forgetPublicIdColumnCache(): void
    {
        $this->hasPublicIdColumn = null;
    }
}

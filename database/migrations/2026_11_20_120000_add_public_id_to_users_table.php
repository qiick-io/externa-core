<?php

declare(strict_types=1);

use App\Services\Api\UserRelationColumnService;
use App\Services\Users\UserPublicIdBackfillService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Additive `users.public_id` UUID v7 for the public API (#827 step 2).
 *
 * Sequence (each DDL step is re-runnable after a crash — MySQL/MariaDB/SQLite have no
 * transactional DDL; SQLite rebuilds the table on `change()`):
 * 1. nullable uuid column;
 * 2. idempotent chunked backfill (`users:backfill-public-id`);
 * 3. unique index;
 * 4. NOT NULL.
 *
 * The bigint primary key stays. New users get `public_id` from `HasUuids` / `uniqueIds`.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'public_id')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->uuid('public_id')->nullable()->after('id');
            });
            UserRelationColumnService::forgetPublicIdColumnCache();
        }

        app(UserPublicIdBackfillService::class)->backfill();

        if (! Schema::hasIndex('users', 'users_public_id_unique')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->unique('public_id');
            });
        }

        // Re-runnable: only force NOT NULL when the column is still nullable.
        $publicIdColumn = collect(Schema::getColumns('users'))
            ->first(fn (array $column): bool => $column['name'] === 'public_id');

        if ($publicIdColumn !== null && ($publicIdColumn['nullable'] ?? false) === true) {
            Schema::table('users', function (Blueprint $table): void {
                $table->uuid('public_id')->nullable(false)->change();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasIndex('users', 'users_public_id_unique')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->dropUnique(['public_id']);
            });
        }

        if (Schema::hasColumn('users', 'public_id')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->dropColumn('public_id');
            });
            UserRelationColumnService::forgetPublicIdColumnCache();
        }
    }
};

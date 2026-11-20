<?php

declare(strict_types=1);

use App\Services\Users\UserPublicIdBackfillService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Additive `users.public_id` UUID v7 for the public API (#827 step 2).
 *
 * Sequence (every engine, including SQLite's table rebuild on `change()`):
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
        Schema::table('users', function (Blueprint $table): void {
            $table->uuid('public_id')->nullable()->after('id');
        });

        app(UserPublicIdBackfillService::class)->backfill();

        Schema::table('users', function (Blueprint $table): void {
            $table->unique('public_id');
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->uuid('public_id')->nullable(false)->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropUnique(['public_id']);
            $table->dropColumn('public_id');
        });
    }
};

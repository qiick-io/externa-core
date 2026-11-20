<?php

declare(strict_types=1);

use App\Services\Settings\SettingsScopeRefService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Additive `settings.scope_ref` so uniqueness never relies on NULL (#827 step 4).
 *
 * Sequence (each DDL step is re-runnable after a crash — MySQL/MariaDB/SQLite have no
 * transactional DDL):
 * 1. archive table for rows dedupe will drop (encrypted values recoverable);
 * 2. `scope_ref` string(36) NOT NULL default '' (instance / null scope_id → '');
 * 3. one UPDATE backfill from `scope_id` and deterministic dedupe (archive then delete);
 * 4. unique index on (scope, scope_ref, group, key).
 *
 * Keeper rule: latest non-null `updated_at` wins; NULL `updated_at` loses to any timestamp;
 * then highest `id`. 1.5 installs that ordered NULL differently may have kept another row —
 * see CHANGELOG. On MySQL / MariaDB the unique uses 191-char prefixes under the 3072-byte
 * InnoDB limit. `scope_id` stays for one release (dual write).
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->ensureArchiveTable();

        if (! Schema::hasColumn('settings', 'scope_ref')) {
            Schema::table('settings', function (Blueprint $table): void {
                $table->string('scope_ref', 36)->default('')->after('scope_id');
            });
            SettingsScopeRefService::forgetScopeRefColumnCache();
        }

        $scopeRef = app(SettingsScopeRefService::class);
        $scopeRef->backfill();
        $scopeRef->dedupe();

        $this->addScopeRefUniqueIfMissing();
    }

    public function down(): void
    {
        if (Schema::hasIndex('settings', 'settings_scope_ref_unique')) {
            Schema::table('settings', function (Blueprint $table): void {
                $table->dropUnique('settings_scope_ref_unique');
            });
        }

        if (Schema::hasColumn('settings', 'scope_ref')) {
            Schema::table('settings', function (Blueprint $table): void {
                $table->dropColumn('scope_ref');
            });
            SettingsScopeRefService::forgetScopeRefColumnCache();
        }

        // Keep settings_dedupe_archive: it is the only copy of rows dedupe deleted.
    }

    private function ensureArchiveTable(): void
    {
        if (Schema::hasTable('settings_dedupe_archive')) {
            return;
        }

        Schema::create('settings_dedupe_archive', function (Blueprint $table): void {
            $table->unsignedBigInteger('id')->primary();
            $table->string('scope');
            $table->unsignedBigInteger('scope_id')->nullable();
            $table->string('scope_ref', 36)->default('');
            $table->string('group');
            $table->string('key');
            $table->json('value')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->string('reason');
            $table->timestamp('migrated_at');
        });
    }

    private function addScopeRefUniqueIfMissing(): void
    {
        if (Schema::hasIndex('settings', 'settings_scope_ref_unique')) {
            return;
        }

        $driver = Schema::getConnection()->getDriverName();

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement(
                'alter table `settings` add unique `settings_scope_ref_unique` (`scope`(191), `scope_ref`(36), `group`(191), `key`(191))'
            );

            return;
        }

        Schema::table('settings', function (Blueprint $table): void {
            $table->unique(['scope', 'scope_ref', 'group', 'key'], 'settings_scope_ref_unique');
        });
    }
};

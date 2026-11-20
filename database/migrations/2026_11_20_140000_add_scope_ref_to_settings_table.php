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
 * Sequence:
 * 1. `scope_ref` string(36) NOT NULL default '' (instance / null scope_id → '');
 * 2. backfill from `scope_id` and deterministically drop duplicate instance rows
 *    (`settings:backfill-scope-ref`);
 * 3. unique index on (scope, scope_ref, group, key).
 *
 * On MySQL / MariaDB the unique uses 191-char prefixes so the index stays under the
 * 3072-byte InnoDB limit (utf8mb4): replacing bigint `scope_id` with `scope_ref(36)`
 * otherwise overflows that limit. SQLite and PostgreSQL take the full columns.
 *
 * `scope_id` stays for one release (dual write from SettingsRepositoryService). The old unique
 * on (scope, scope_id, group, key) is left in place until a later release drops it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('settings', function (Blueprint $table): void {
            $table->string('scope_ref', 36)->default('')->after('scope_id');
        });

        $scopeRef = app(SettingsScopeRefService::class);
        $scopeRef->backfill();
        $scopeRef->dedupe();

        $this->addScopeRefUnique();
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table): void {
            $table->dropUnique('settings_scope_ref_unique');
            $table->dropColumn('scope_ref');
        });
    }

    private function addScopeRefUnique(): void
    {
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

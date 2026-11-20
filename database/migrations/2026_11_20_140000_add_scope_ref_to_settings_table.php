<?php

declare(strict_types=1);

use App\Services\Settings\SettingsScopeRefService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
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

        Schema::table('settings', function (Blueprint $table): void {
            $table->unique(['scope', 'scope_ref', 'group', 'key'], 'settings_scope_ref_unique');
        });
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table): void {
            $table->dropUnique('settings_scope_ref_unique');
            $table->dropColumn('scope_ref');
        });
    }
};

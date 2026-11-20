<?php

declare(strict_types=1);

use App\Models\Setting;
use App\Services\Settings\SettingsRepositoryService;
use App\Services\Settings\SettingsScopeRefService;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * settings.scope_ref closes the NULL unique hole on instance rows (#827 step 4).
 */
test('settings table has scope_ref and repository dual-writes scope_id', function (): void {
    expect(Schema::hasColumn('settings', 'scope_ref'))->toBeTrue();

    $settings = app(SettingsRepositoryService::class);
    $settings->set(SettingsRepositoryService::SCOPE_PROJECT, 'project', 'scope_ref_probe', 'hello');

    $row = Setting::query()
        ->where('scope', SettingsRepositoryService::SCOPE_PROJECT)
        ->where('scope_ref', SettingsRepositoryService::SCOPE_REF_INSTANCE)
        ->where('group', 'project')
        ->where('key', 'scope_ref_probe')
        ->first();

    expect($row)->not->toBeNull()
        ->and($row?->scope_ref)->toBe('')
        ->and($row?->scope_id)->toBeNull()
        ->and($row?->value)->toBe('hello')
        ->and($settings->get(SettingsRepositoryService::SCOPE_PROJECT, 'project', 'scope_ref_probe'))->toBe('hello');
});

test('settings:backfill-scope-ref dry-run prints counts without writing', function (): void {
    expect(Artisan::call('settings:backfill-scope-ref', ['--dry-run' => true]))->toBe(0);
    $output = Artisan::output();
    expect($output)->toContain('[dry-run] settings needing scope_ref backfill:')
        ->and($output)->toContain('[dry-run] duplicate groups:');
});

test('a duplicate instance key is refused on postgresql and mysql', function (): void {
    if (! in_array(DB::getDriverName(), ['pgsql', 'mysql', 'mariadb'], true)) {
        $this->markTestSkipped('Empty-string uniqueness for instance settings is asserted on PostgreSQL, MySQL and MariaDB.');
    }

    Setting::query()->create([
        'scope' => SettingsRepositoryService::SCOPE_PROJECT,
        'scope_id' => null,
        'scope_ref' => SettingsRepositoryService::SCOPE_REF_INSTANCE,
        'group' => 'project',
        'key' => 'duplicate_probe',
        'value' => 'first',
    ]);

    expect(fn () => Setting::query()->create([
        'scope' => SettingsRepositoryService::SCOPE_PROJECT,
        'scope_id' => null,
        'scope_ref' => SettingsRepositoryService::SCOPE_REF_INSTANCE,
        'group' => 'project',
        'key' => 'duplicate_probe',
        'value' => 'second',
    ]))->toThrow(QueryException::class);
});

test('dedupe keeps the latest updated_at instance row', function (): void {
    // Insert duplicates before the unique index would block them: temporarily drop it.
    Schema::table('settings', function ($table): void {
        $table->dropUnique('settings_scope_ref_unique');
    });

    $olderId = DB::table('settings')->insertGetId([
        'scope' => 'project',
        'scope_id' => null,
        'scope_ref' => '',
        'group' => 'project',
        'key' => 'dedupe_probe',
        'value' => json_encode('older'),
        'created_at' => '2026-01-01 00:00:00',
        'updated_at' => '2026-01-01 00:00:00',
    ]);
    $newerId = DB::table('settings')->insertGetId([
        'scope' => 'project',
        'scope_id' => null,
        'scope_ref' => '',
        'group' => 'project',
        'key' => 'dedupe_probe',
        'value' => json_encode('newer'),
        'created_at' => '2026-02-01 00:00:00',
        'updated_at' => '2026-02-01 00:00:00',
    ]);

    $counts = app(SettingsScopeRefService::class)->duplicateCounts();
    expect($counts['groups'])->toBeGreaterThanOrEqual(1)
        ->and($counts['rows_to_drop'])->toBeGreaterThanOrEqual(1);

    $deleted = app(SettingsScopeRefService::class)->dedupe();
    expect($deleted)->toBeGreaterThanOrEqual(1);
    expect(DB::table('settings')->where('id', $olderId)->exists())->toBeFalse();
    expect(DB::table('settings')->where('id', $newerId)->value('value'))->toBe(json_encode('newer'));

    $driver = DB::getDriverName();

    if (in_array($driver, ['mysql', 'mariadb'], true)) {
        DB::statement(
            'alter table `settings` add unique `settings_scope_ref_unique` (`scope`(191), `scope_ref`(36), `group`(191), `key`(191))'
        );
    } else {
        Schema::table('settings', function ($table): void {
            $table->unique(['scope', 'scope_ref', 'group', 'key'], 'settings_scope_ref_unique');
        });
    }
});

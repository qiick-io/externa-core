<?php

declare(strict_types=1);

use App\Models\Setting;
use App\Services\Chat\ChatUnreadService;
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

test('settings:backfill-scope-ref dry-run works before scope_ref exists and lists drop rows', function (): void {
    Schema::table('settings', function ($table): void {
        if (Schema::hasIndex('settings', 'settings_scope_ref_unique')) {
            $table->dropUnique('settings_scope_ref_unique');
        }
    });

    if (Schema::hasColumn('settings', 'scope_ref')) {
        Schema::table('settings', function ($table): void {
            $table->dropColumn('scope_ref');
        });
    }

    app(SettingsScopeRefService::class)->forgetScopeRefColumnCache();

    DB::table('settings')->insert([
        [
            'scope' => 'project',
            'scope_id' => null,
            'group' => 'project',
            'key' => 'dry_run_probe',
            'value' => json_encode('a'),
            'created_at' => '2026-01-01 00:00:00',
            'updated_at' => '2026-01-01 00:00:00',
        ],
        [
            'scope' => 'project',
            'scope_id' => null,
            'group' => 'project',
            'key' => 'dry_run_probe',
            'value' => json_encode('b'),
            'created_at' => '2026-02-01 00:00:00',
            'updated_at' => '2026-02-01 00:00:00',
        ],
    ]);

    expect(Artisan::call('settings:backfill-scope-ref', ['--dry-run' => true]))->toBe(0);
    $output = Artisan::output();
    expect($output)->toContain('[dry-run] settings needing scope_ref backfill:')
        ->and($output)->toContain('[dry-run] duplicate groups:')
        ->and($output)->toContain('[dry-run] would drop settings id=')
        ->and(Schema::hasColumn('settings', 'scope_ref'))->toBeFalse();

    // Restore column + unique for later tests in this process (migration already recorded as ran).
    /** @var object{up(): void} $migration */
    $migration = require database_path('migrations/2026_11_20_140000_add_scope_ref_to_settings_table.php');
    $migration->up();
    app(SettingsScopeRefService::class)->forgetScopeRefColumnCache();
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

test('dedupe archives losers and keeps latest non-null updated_at with lower id winning over higher older id', function (): void {
    Schema::table('settings', function ($table): void {
        $table->dropUnique('settings_scope_ref_unique');
    });

    $keeperId = DB::table('settings')->insertGetId([
        'scope' => 'project',
        'scope_id' => null,
        'scope_ref' => '',
        'group' => 'project',
        'key' => 'dedupe_probe',
        'value' => json_encode('newer'),
        'created_at' => '2026-02-01 00:00:00',
        'updated_at' => '2026-03-01 00:00:00',
    ]);
    $olderHigherId = DB::table('settings')->insertGetId([
        'scope' => 'project',
        'scope_id' => null,
        'scope_ref' => '',
        'group' => 'project',
        'key' => 'dedupe_probe',
        'value' => json_encode('older'),
        'created_at' => '2026-01-01 00:00:00',
        'updated_at' => '2026-01-01 00:00:00',
    ]);
    $nullUpdatedId = DB::table('settings')->insertGetId([
        'scope' => 'project',
        'scope_id' => null,
        'scope_ref' => '',
        'group' => 'project',
        'key' => 'dedupe_probe',
        'value' => json_encode('null-updated'),
        'created_at' => '2026-04-01 00:00:00',
        'updated_at' => null,
    ]);

    $deleted = app(SettingsScopeRefService::class)->dedupe();
    expect($deleted)->toBe(2);
    expect(DB::table('settings')->where('id', $keeperId)->value('value'))->toBe(json_encode('newer'));
    expect(DB::table('settings')->where('id', $olderHigherId)->exists())->toBeFalse();
    expect(DB::table('settings')->where('id', $nullUpdatedId)->exists())->toBeFalse();
    expect(DB::table('settings_dedupe_archive')->where('id', $olderHigherId)->exists())->toBeTrue();
    expect(DB::table('settings_dedupe_archive')->where('id', $nullUpdatedId)->exists())->toBeTrue();

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

test('scope_ref migration is re-runnable after a partial apply', function (): void {
    if (Schema::hasIndex('settings', 'settings_scope_ref_unique')) {
        Schema::table('settings', function ($table): void {
            $table->dropUnique('settings_scope_ref_unique');
        });
    }

    // Simulate crash after column add but before unique: column present, index missing.
    expect(Schema::hasColumn('settings', 'scope_ref'))->toBeTrue()
        ->and(Schema::hasIndex('settings', 'settings_scope_ref_unique'))->toBeFalse();

    /** @var object{up(): void} $migration */
    $migration = require database_path('migrations/2026_11_20_140000_add_scope_ref_to_settings_table.php');
    $migration->up();

    expect(Schema::hasColumn('settings', 'scope_ref'))->toBeTrue()
        ->and(Schema::hasIndex('settings', 'settings_scope_ref_unique'))->toBeTrue();

    // Full second run must also be a no-op success.
    $migration->up();
    expect(Schema::hasIndex('settings', 'settings_scope_ref_unique'))->toBeTrue();
});

test('settings:backfill-scope-ref without dry-run refuses when the archive table is missing', function (): void {
    Schema::table('settings', function ($table): void {
        if (Schema::hasIndex('settings', 'settings_scope_ref_unique')) {
            $table->dropUnique('settings_scope_ref_unique');
        }
    });

    if (Schema::hasColumn('settings', 'scope_ref')) {
        Schema::table('settings', function ($table): void {
            $table->dropColumn('scope_ref');
        });
    }

    Schema::dropIfExists('settings_dedupe_archive');
    app(SettingsScopeRefService::class)->forgetScopeRefColumnCache();

    DB::table('settings')->insert([
        [
            'scope' => 'project',
            'scope_id' => null,
            'group' => 'project',
            'key' => 'refuse_archive_probe',
            'value' => json_encode('a'),
            'created_at' => '2026-01-01 00:00:00',
            'updated_at' => '2026-01-01 00:00:00',
        ],
        [
            'scope' => 'project',
            'scope_id' => null,
            'group' => 'project',
            'key' => 'refuse_archive_probe',
            'value' => json_encode('b'),
            'created_at' => '2026-02-01 00:00:00',
            'updated_at' => '2026-02-01 00:00:00',
        ],
    ]);

    expect(Artisan::call('settings:backfill-scope-ref'))->not->toBe(0);
    expect(Artisan::output())->toContain('settings_dedupe_archive is missing');
    expect(DB::table('settings')->where('key', 'refuse_archive_probe')->count())->toBe(2);

    /** @var object{up(): void} $migration */
    $migration = require database_path('migrations/2026_11_20_140000_add_scope_ref_to_settings_table.php');
    $migration->up();
    app(SettingsScopeRefService::class)->forgetScopeRefColumnCache();
});

test('scope_ref migration down keeps the dedupe archive table', function (): void {
    expect(Schema::hasTable('settings_dedupe_archive'))->toBeTrue();

    /** @var object{up(): void, down(): void} $migration */
    $migration = require database_path('migrations/2026_11_20_140000_add_scope_ref_to_settings_table.php');
    $migration->down();

    expect(Schema::hasTable('settings_dedupe_archive'))->toBeTrue()
        ->and(Schema::hasColumn('settings', 'scope_ref'))->toBeFalse();

    $migration->up();
    app(SettingsScopeRefService::class)->forgetScopeRefColumnCache();
    expect(Schema::hasColumn('settings', 'scope_ref'))->toBeTrue();
});

test('chat unread subscribers fall back to scope_id when scope_ref is missing', function (): void {
    Schema::table('settings', function ($table): void {
        if (Schema::hasIndex('settings', 'settings_scope_ref_unique')) {
            $table->dropUnique('settings_scope_ref_unique');
        }
    });

    if (Schema::hasColumn('settings', 'scope_ref')) {
        Schema::table('settings', function ($table): void {
            $table->dropColumn('scope_ref');
        });
    }

    app(SettingsScopeRefService::class)->forgetScopeRefColumnCache();

    $userId = 4242;
    $collectionId = 99;

    DB::table('settings')->insert([
        'scope' => 'user',
        'scope_id' => $userId,
        'group' => ChatUnreadService::NOTIFY_GROUP,
        'key' => ChatUnreadService::NOTIFY_KEY,
        'value' => json_encode([$collectionId]),
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $subscriberIds = app(ChatUnreadService::class)->subscriberIdsForCollection($collectionId);

    expect($subscriberIds)->toContain($userId);

    /** @var object{up(): void} $migration */
    $migration = require database_path('migrations/2026_11_20_140000_add_scope_ref_to_settings_table.php');
    $migration->up();
    app(SettingsScopeRefService::class)->forgetScopeRefColumnCache();
});

test('repository falls back to scope_id when scope_ref is missing', function (): void {
    Schema::table('settings', function ($table): void {
        if (Schema::hasIndex('settings', 'settings_scope_ref_unique')) {
            $table->dropUnique('settings_scope_ref_unique');
        }
    });

    if (Schema::hasColumn('settings', 'scope_ref')) {
        Schema::table('settings', function ($table): void {
            $table->dropColumn('scope_ref');
        });
    }

    app(SettingsScopeRefService::class)->forgetScopeRefColumnCache();

    DB::table('settings')->insert([
        'scope' => 'project',
        'scope_id' => null,
        'group' => 'project',
        'key' => 'fallback_probe',
        'value' => json_encode('from-scope-id'),
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $settings = app(SettingsRepositoryService::class);
    expect($settings->get(SettingsRepositoryService::SCOPE_PROJECT, 'project', 'fallback_probe'))
        ->toBe('from-scope-id');

    $settings->set(SettingsRepositoryService::SCOPE_PROJECT, 'project', 'fallback_probe_write', 'written');
    expect(DB::table('settings')->where('key', 'fallback_probe_write')->whereNull('scope_id')->exists())->toBeTrue();

    /** @var object{up(): void} $migration */
    $migration = require database_path('migrations/2026_11_20_140000_add_scope_ref_to_settings_table.php');
    $migration->up();
    app(SettingsScopeRefService::class)->forgetScopeRefColumnCache();
});

test('repository recovers when scope_ref was dropped after the probe memoised it', function (): void {
    $scopeRef = app(SettingsScopeRefService::class);
    $settings = app(SettingsRepositoryService::class);

    expect($scopeRef->hasScopeRefColumn())->toBeTrue();

    $settings->set(SettingsRepositoryService::SCOPE_PROJECT, 'project', 'stale_memo_probe', 'kept');

    Schema::table('settings', function ($table): void {
        if (Schema::hasIndex('settings', 'settings_scope_ref_unique')) {
            $table->dropUnique('settings_scope_ref_unique');
        }
    });
    Schema::table('settings', function ($table): void {
        $table->dropColumn('scope_ref');
    });

    // No forget: simulates a restored pre-upgrade backup while the request still holds a positive memo.
    expect($scopeRef->hasScopeRefColumn())->toBeTrue()
        ->and(Schema::hasColumn('settings', 'scope_ref'))->toBeFalse();

    expect($settings->get(SettingsRepositoryService::SCOPE_PROJECT, 'project', 'stale_memo_probe'))
        ->toBe('kept')
        ->and($scopeRef->hasScopeRefColumn())->toBeFalse();

    $settings->set(SettingsRepositoryService::SCOPE_PROJECT, 'project', 'stale_memo_write', 'written');
    expect(DB::table('settings')->where('key', 'stale_memo_write')->whereNull('scope_id')->exists())->toBeTrue();

    /** @var object{up(): void} $migration */
    $migration = require database_path('migrations/2026_11_20_140000_add_scope_ref_to_settings_table.php');
    $migration->up();
    $scopeRef->forgetScopeRefColumnCache();
});

<?php

declare(strict_types=1);

use App\Models\Role;
use App\Models\User;
use App\Services\Settings\SettingsRepositoryService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * The #781 data migration rewrites the 1.4.0 permission columns (`read_only`, `files_scope` and
 * the MCP-only `scopes`) into the shared `<resource>:<read|write>` vocabulary.
 *
 * The test database is already migrated, so each test first puts back the two columns the
 * migration drops, exactly as 1.4.0 declared them, and then runs the migration on legacy rows.
 */
beforeEach(function (): void {
    Schema::table('api_keys', function (Blueprint $table): void {
        $table->boolean('read_only')->default(false);
        $table->string('files_scope', 16)->default('all');
    });

    $this->role = Role::factory()->create(['name' => 'legacy-api-consumer']);
});

function runApiKeyScopeTranslationMigration(): void
{
    $migration = require database_path('migrations/2026_11_17_170100_translate_api_key_permissions_to_scopes.php');
    $migration->up();
}

/**
 * Insert an api_keys row the way 1.4.0 stored it, bypassing the model (which no longer knows
 * the legacy columns).
 *
 * @param  array<string, mixed>  $legacyColumns
 */
function insertLegacyApiKey(Role $role, array $legacyColumns): int
{
    static $sequence = 0;
    $sequence++;

    return (int) DB::table('api_keys')->insertGetId(array_merge([
        'uuid' => (string) Str::uuid(),
        'name' => 'Legacy key '.$sequence,
        'key_prefix' => 'ek_legacy'.$sequence,
        'key_hash' => hash('sha256', 'legacy-secret-'.$sequence),
        'role_id' => $role->id,
        'read_only' => false,
        'files_scope' => 'all',
        'scopes' => null,
        'created_at' => now(),
        'updated_at' => now(),
    ], $legacyColumns));
}

/**
 * @return list<string>|null
 */
function translatedScopes(int $apiKeyId): ?array
{
    $storedScopes = DB::table('api_keys')->where('id', $apiKeyId)->value('scopes');

    return $storedScopes === null ? null : json_decode((string) $storedScopes, true);
}

test('each legacy permission combination becomes the scopes it was actually allowed', function (
    bool $isReadOnly,
    string $filesScope,
    ?array $legacyScopes,
    array $expectedScopes,
) {
    $apiKeyId = insertLegacyApiKey($this->role, [
        'read_only' => $isReadOnly,
        'files_scope' => $filesScope,
        'scopes' => $legacyScopes === null ? null : json_encode($legacyScopes),
    ]);

    runApiKeyScopeTranslationMigration();

    expect(translatedScopes($apiKeyId))->toBe($expectedScopes);
})->with([
    'full key, all files' => [false, 'all', null, ['collections:write', 'files:write']],
    'full key, read files' => [false, 'read', null, ['collections:write', 'files:read']],
    'full key, no files' => [false, 'none', null, ['collections:write']],
    'read-only key, read files' => [true, 'read', null, ['collections:read', 'files:read']],
    'read-only key, no files' => [true, 'none', null, ['collections:read']],
    // The contradiction 1.4.0 allowed: read_only won at request time, so files stay read.
    'read-only key with files_scope all' => [true, 'all', null, ['collections:read', 'files:read']],
    'mcp:read' => [false, 'none', ['mcp:read'], ['collections:write', 'mcp:read']],
    'mcp:read and mcp:write' => [false, 'none', ['mcp:read', 'mcp:write'], ['collections:write', 'mcp:write']],
    // 1.4.0 refused /mcp without mcp:read, so mcp:write alone never reached a tool.
    'mcp:write without mcp:read' => [false, 'none', ['mcp:write'], ['collections:write']],
    'read-only key with mcp:write' => [true, 'none', ['mcp:read', 'mcp:write'], ['collections:read', 'mcp:read']],
    'unknown scope entry is dropped' => [false, 'none', ['mcp:read', 'admin:all', 'MCP:WRITE'], ['collections:write', 'mcp:read']],
    'empty legacy scope list' => [false, 'read', [], ['collections:write', 'files:read']],
    // The enum cast threw on any other value, so such a key could not use files in 1.4.0.
    'unknown files_scope grants no files' => [false, 'everything', null, ['collections:write']],
]);

/**
 * The 'not json' case runs on SQLite only, where a json column is plain TEXT. PostgreSQL,
 * MySQL and MariaDB validate the column, so a 1.4.0 install on them can never hold such a row
 * and the migration's defensive branch is unreachable there: the skip states that fact, it is
 * not a workaround. Without it the case fails on the fixture insert, before the migration runs.
 *
 * Rehearsed with the real 1.4.0 → 1.5.0 upgrade on PostgreSQL 18.6, MySQL 8.4 and MariaDB 10.11
 * (#790); inserting `mcp:read` into `api_keys.scopes` failed on each:
 * - pgsql: SQLSTATE[22P02] invalid input syntax for type json, Token "mcp" is invalid
 * - mysql: SQLSTATE[22032] 3140 Invalid JSON text: "Invalid value." at position 0
 * - mariadb: SQLSTATE[23000] 4025 CONSTRAINT `api_keys.scopes` failed
 */
test('a legacy scopes value that is not a list grants nothing extra', function (string $storedScopes) {
    if (DB::getDriverName() !== 'sqlite' && ! json_validate($storedScopes)) {
        $this->markTestSkipped('A non-JSON scopes value is only storable on SQLite.');
    }

    $apiKeyId = insertLegacyApiKey($this->role, [
        'files_scope' => 'none',
        'scopes' => $storedScopes,
    ]);

    runApiKeyScopeTranslationMigration();

    expect(translatedScopes($apiKeyId))->toBe(['collections:write']);
})->with([
    'object' => ['{"mcp:read": true}'],
    'string' => ['"mcp:write"'],
    'not json' => ['mcp:read'],
]);

test('every translated legacy key keeps at least one scope', function () {
    foreach ([[false, 'all'], [false, 'read'], [false, 'none'], [true, 'all'], [true, 'read'], [true, 'none']] as [$isReadOnly, $filesScope]) {
        insertLegacyApiKey($this->role, ['read_only' => $isReadOnly, 'files_scope' => $filesScope]);
    }

    runApiKeyScopeTranslationMigration();

    $scopeLists = DB::table('api_keys')->pluck('scopes')
        ->map(fn (mixed $storedScopes): mixed => json_decode((string) $storedScopes, true));

    expect($scopeLists)->toHaveCount(6)
        ->each(fn ($scopeList) => $scopeList->toBeArray()->not->toBeEmpty());
});

test('revoked and expired keys are translated and stay revoked and expired', function () {
    $revokedAt = now()->subDay()->startOfSecond();
    $expiresAt = now()->subHour()->startOfSecond();
    $revokedKeyId = insertLegacyApiKey($this->role, ['revoked_at' => $revokedAt, 'read_only' => true]);
    $expiredKeyId = insertLegacyApiKey($this->role, ['expires_at' => $expiresAt, 'files_scope' => 'none']);

    runApiKeyScopeTranslationMigration();

    expect(translatedScopes($revokedKeyId))->toBe(['collections:read', 'files:read'])
        ->and(DB::table('api_keys')->where('id', $revokedKeyId)->value('revoked_at'))->toBe($revokedAt->toDateTimeString())
        ->and(translatedScopes($expiredKeyId))->toBe(['collections:write'])
        ->and(DB::table('api_keys')->where('id', $expiredKeyId)->value('expires_at'))->toBe($expiresAt->toDateTimeString());
});

test('the legacy permission columns are dropped', function () {
    insertLegacyApiKey($this->role, []);

    runApiKeyScopeTranslationMigration();

    expect(Schema::hasColumn('api_keys', 'read_only'))->toBeFalse()
        ->and(Schema::hasColumn('api_keys', 'files_scope'))->toBeFalse()
        ->and(DB::table('api_keys')->count())->toBe(1);
});

test('nothing but the scopes changes, on the key or anywhere else', function () {
    $owner = User::factory()->create();
    $lastUsedAt = now()->subMinutes(5)->startOfSecond();
    $updatedAt = now()->subWeek()->startOfSecond();
    $apiKeyId = insertLegacyApiKey($this->role, [
        'name' => 'Website build',
        'key_prefix' => 'ek_untouched',
        'key_hash' => hash('sha256', 'untouched-secret'),
        'collection_slugs' => json_encode(['posts', 'pages']),
        'ip_allowlist' => json_encode(['10.0.0.0/8']),
        'rate_limit_per_minute' => 120,
        'owner_id' => $owner->id,
        'created_by' => $owner->id,
        'last_used_at' => $lastUsedAt,
        'updated_at' => $updatedAt,
    ]);
    $columnsBefore = collect((array) DB::table('api_keys')->where('id', $apiKeyId)->first())
        ->except(['scopes', 'read_only', 'files_scope']);

    app(SettingsRepositoryService::class)->setMany(
        SettingsRepositoryService::SCOPE_PROJECT,
        'appearance',
        ['theme_preset' => 'ottanio', 'project_color' => '#112233'],
        null,
    );
    $settingsBefore = DB::table('settings')->orderBy('id')->get()->map(fn (object $settingRow): array => (array) $settingRow)->all();

    runApiKeyScopeTranslationMigration();

    $columnsAfter = collect((array) DB::table('api_keys')->where('id', $apiKeyId)->first())->except(['scopes']);
    $settingsAfter = DB::table('settings')->orderBy('id')->get()->map(fn (object $settingRow): array => (array) $settingRow)->all();

    expect($columnsAfter->all())->toBe($columnsBefore->all())
        ->and($settingsAfter)->toBe($settingsBefore);
});

<?php

declare(strict_types=1);

namespace Tests\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

/**
 * The data a populated install of the last release holds, and what an upgrade must keep of it
 * (#792, #794). Two rehearsals share it, so there is one definition of "the data survived":
 *
 * - `tests/Upgrade/ReleaseUpgradeRehearsalTest.php` migrates a database to the release tag's
 *   migrations, seeds it, runs this branch's migrations and checks;
 * - `scripts/e2e/install-upgrade.sh` seeds a real `composer create-project` install of the
 *   previous release and checks it after `externa:upgrade` (through `upgrade-fixtures.php`).
 *
 * It uses the query builder only, never models: it also runs inside the previous release,
 * where this branch's models describe columns that do not exist yet.
 *
 * Fixtures are grouped by the migration that reads them, and a group is seeded only while that
 * migration is pending. Once a release ships its groups seed nothing and can be deleted; a new
 * data migration adds a group here. Every expectation is re-expressed from the migration's
 * docblock, never copied from its code, so a wrong translation fails instead of confirming itself.
 *
 * The invariants checked for every table, fixture or not:
 * - no row is lost (a row is found again by `id`, or by its whole content when there is none);
 * - no column a row keeps is rewritten, identity columns (`key_hash`, `key_prefix`) and
 *   `updated_at` included, except where a migration's docblock says it rewrites that value.
 */
final class ReleaseUpgradeFixtures
{
    public const API_KEY_SCOPES_MIGRATION = '2026_11_17_170100_translate_api_key_permissions_to_scopes';

    public const THEME_PRESETS_MIGRATION = '2026_11_17_152952_rename_theme_presets_to_italian_names';

    public const PENDING_TOOL_CALL_API_KEY_MIGRATION = '2026_11_11_115827_add_api_key_id_to_pending_tool_calls_table';

    public const API_KEYS_ROLE_RESTRICT_MIGRATION = '2026_11_22_094151_change_api_keys_role_id_to_restrict_on_delete';

    /**
     * Cache tables: the upgrade clears them on purpose (`optimize:clear`).
     */
    private const DISPOSABLE_TABLES = ['cache', 'cache_locks'];

    /**
     * Tables the upgrade itself writes to (`migrate` and `permissions:sync`): rows may be added
     * or touched, never lost.
     */
    private const TABLES_WRITTEN_BY_THE_UPGRADE = ['migrations', 'permissions', 'roles', 'role_has_permissions'];

    /**
     * The `files_scope` values 1.4.0 could hold, and the files scope the docblock promises:
     * `read` → read, `all` → write, `none` or anything else → none.
     *
     * @var array<string, string|null>
     */
    private const FILES_ACCESS_BY_LEGACY_FILES_SCOPE = [
        'all' => 'write',
        'read' => 'read',
        'none' => null,
        'everything' => null,
    ];

    /**
     * Stored MCP `scopes` (SQL NULL as the empty key), and the MCP scope the docblock promises:
     * `mcp:read` → read, `mcp:read` + `mcp:write` → write, `mcp:write` alone, other entries and
     * anything that is not a JSON list → none. Every value is valid JSON: PostgreSQL, MySQL and
     * MariaDB refuse anything else in a json column, so no install outside SQLite can hold it.
     *
     * @var array<string, string|null>
     */
    private const MCP_ACCESS_BY_LEGACY_SCOPES = [
        '' => null,
        '[]' => null,
        '["mcp:read"]' => 'read',
        '["mcp:write"]' => null,
        '["mcp:read","mcp:write"]' => 'write',
        '["mcp:write","mcp:read"]' => 'write',
        '["mcp:read","admin:all","MCP:WRITE"]' => 'read',
        '{"mcp:read":true}' => null,
        '"mcp:read"' => null,
    ];

    /**
     * One project per row: the stored preset, its brand hexes, and the preset the docblock
     * promises (null = the row is left alone: a custom hex wins over the preset). An empty hex
     * is no custom colour.
     *
     * @var list<array{preset: string, projectColor: string|null, projectColorDark: string|null, expectedPreset: string|null}>
     */
    private const THEME_PRESET_PROJECTS = [
        ['preset' => 'teal', 'projectColor' => null, 'projectColorDark' => null, 'expectedPreset' => 'ottanio'],
        ['preset' => 'indigo', 'projectColor' => null, 'projectColorDark' => null, 'expectedPreset' => 'indaco'],
        ['preset' => 'violet', 'projectColor' => null, 'projectColorDark' => null, 'expectedPreset' => 'ametista'],
        ['preset' => 'rose', 'projectColor' => null, 'projectColorDark' => null, 'expectedPreset' => 'robbia'],
        ['preset' => 'slate', 'projectColor' => null, 'projectColorDark' => null, 'expectedPreset' => 'ardesia'],
        ['preset' => 'blue', 'projectColor' => null, 'projectColorDark' => null, 'expectedPreset' => 'ottanio'],
        ['preset' => 'neon', 'projectColor' => null, 'projectColorDark' => null, 'expectedPreset' => 'ottanio'],
        ['preset' => 'ardesia', 'projectColor' => null, 'projectColorDark' => null, 'expectedPreset' => 'ardesia'],
        ['preset' => 'blue', 'projectColor' => '#112233', 'projectColorDark' => null, 'expectedPreset' => null],
        ['preset' => 'rose', 'projectColor' => null, 'projectColorDark' => '#38bdf8', 'expectedPreset' => null],
        ['preset' => 'rose', 'projectColor' => '', 'projectColorDark' => null, 'expectedPreset' => 'robbia'],
    ];

    /**
     * Project ids of the theme fixtures start here, clear of any project an install has.
     */
    private const FIRST_FIXTURE_PROJECT_ID = 9001;

    private const FIXTURE_CREATED_AT = '2026-03-04 05:06:07';

    private const FIXTURE_UPDATED_AT = '2026-04-05 06:07:08';

    /**
     * Seed the fixtures of every pending data migration, then snapshot the whole database.
     *
     * @param  list<string>  $pendingMigrations  migration names (no `.php`) the upgrade will run
     * @return array<string, mixed> JSON-serialisable snapshot for {@see violations()}
     *
     * @throws RuntimeException when a migration said to be pending already ran on this database
     */
    public static function seed(array $pendingMigrations): array
    {
        $ranMigrations = DB::table(self::migrationsTable())->pluck('migration')->all();
        $seededGroups = [];
        $expectations = [];

        foreach (self::fixtureGroups() as $migration => $seedGroup) {
            if (! in_array($migration, $pendingMigrations, true)) {
                continue;
            }

            if (in_array($migration, $ranMigrations, true)) {
                throw new RuntimeException("{$migration} is said to be pending but already ran on this database.");
            }

            $expectations[$migration] = $seedGroup();
            $seededGroups[] = $migration;
        }

        return self::roundTripped([
            'seededGroups' => $seededGroups,
            'expectations' => $expectations,
            'tables' => self::snapshotTables(),
        ]);
    }

    /**
     * Everything the upgrade broke, as readable sentences; an empty list is a passed upgrade.
     *
     * @param  array<string, mixed>  $snapshot  what {@see seed()} returned before the upgrade
     * @return list<string>
     */
    public static function violations(array $snapshot): array
    {
        /** @var list<string> $seededGroups */
        $seededGroups = $snapshot['seededGroups'];
        /** @var array<string, array<string, mixed>> $expectations */
        $expectations = $snapshot['expectations'];
        /** @var array<string, array{keyColumn: string|null, rows: array<string, array<string, string|null>>}> $tablesBefore */
        $tablesBefore = $snapshot['tables'];

        $tablesAfter = self::snapshotTables();
        $ranMigrations = DB::table(self::migrationsTable())->pluck('migration')->all();
        $violations = [];

        foreach ($seededGroups as $migration) {
            if (! in_array($migration, $ranMigrations, true)) {
                $violations[] = "{$migration} did not run.";
            }
        }

        foreach ($tablesBefore as $table => $tableBefore) {
            if (in_array($table, self::DISPOSABLE_TABLES, true)) {
                continue;
            }

            if (! isset($tablesAfter[$table])) {
                $violations[] = "Table {$table} is gone.";

                continue;
            }

            foreach ($tableBefore['rows'] as $rowKey => $rowBefore) {
                $rowAfter = $tablesAfter[$table]['rows'][$rowKey] ?? null;

                if ($rowAfter === null) {
                    $violations[] = "{$table} row {$rowKey} is lost.";

                    continue;
                }

                if (in_array($table, self::TABLES_WRITTEN_BY_THE_UPGRADE, true)) {
                    continue;
                }

                foreach (array_intersect_key($rowBefore, $rowAfter) as $column => $valueBefore) {
                    if ($rowAfter[$column] !== $valueBefore && ! self::isRewrittenByAMigration($seededGroups, $table, $rowBefore, $column)) {
                        $violations[] = "{$table} row {$rowKey}: {$column} was rewritten from ".var_export($valueBefore, true).' to '.var_export($rowAfter[$column], true).'.';
                    }
                }
            }
        }

        if (in_array(self::API_KEY_SCOPES_MIGRATION, $seededGroups, true)) {
            /** @var array<string, list<string>> $scopesByApiKeyId */
            $scopesByApiKeyId = $expectations[self::API_KEY_SCOPES_MIGRATION];
            array_push($violations, ...self::apiKeyScopeViolations($scopesByApiKeyId, $tablesAfter['api_keys']['rows'] ?? []));
        }

        if (in_array(self::THEME_PRESETS_MIGRATION, $seededGroups, true)) {
            /** @var array<string, string|null> $presetsBySettingId */
            $presetsBySettingId = $expectations[self::THEME_PRESETS_MIGRATION];
            array_push($violations, ...self::themePresetViolations($presetsBySettingId, $tablesBefore['settings']['rows'], $tablesAfter['settings']['rows'] ?? []));
        }

        if (in_array(self::PENDING_TOOL_CALL_API_KEY_MIGRATION, $seededGroups, true)) {
            /** @var list<string> $pendingToolCallIds */
            $pendingToolCallIds = $expectations[self::PENDING_TOOL_CALL_API_KEY_MIGRATION];

            foreach ($pendingToolCallIds as $pendingToolCallId) {
                $apiKeyId = $tablesAfter['pending_tool_calls']['rows'][$pendingToolCallId]['api_key_id'] ?? null;

                if ($apiKeyId !== null) {
                    $violations[] = "pending_tool_calls row {$pendingToolCallId}: api_key_id should stay null, got {$apiKeyId}.";
                }
            }
        }

        if (in_array(self::API_KEYS_ROLE_RESTRICT_MIGRATION, $seededGroups, true)) {
            /** @var array{roleIds: list<string>, apiKeyIds: list<string>} $roleRestrictExpectations */
            $roleRestrictExpectations = $expectations[self::API_KEYS_ROLE_RESTRICT_MIGRATION];
            array_push($violations, ...self::apiKeysRoleRestrictViolations($roleRestrictExpectations));
        }

        return $violations;
    }

    /**
     * Seeders by the migration whose input they are; each returns its expectations.
     *
     * @return array<string, callable(): array<array-key, mixed>>
     */
    private static function fixtureGroups(): array
    {
        return [
            self::PENDING_TOOL_CALL_API_KEY_MIGRATION => self::seedPendingToolCalls(...),
            self::THEME_PRESETS_MIGRATION => self::seedThemePresets(...),
            self::API_KEY_SCOPES_MIGRATION => self::seedApiKeys(...),
            self::API_KEYS_ROLE_RESTRICT_MIGRATION => self::seedApiKeysBoundToCustomRoles(...),
        ];
    }

    /**
     * Every `read_only` × `files_scope` × stored `scopes` combination 1.4.0 could hold (72 keys),
     * with legacy 12-character and full 16-character prefixes for the `key_prefix` widening,
     * and some revoked, expired or used keys, which must stay so.
     *
     * @return array<string, list<string>> expected scopes by api key id
     */
    private static function seedApiKeys(): array
    {
        $roleId = DB::table('roles')->insertGetId([
            'name' => 'upgrade-rehearsal',
            'guard_name' => 'web',
            'created_at' => self::FIXTURE_CREATED_AT,
            'updated_at' => self::FIXTURE_UPDATED_AT,
        ]);
        $scopesByApiKeyId = [];
        $sequence = 0;

        foreach ([false, true] as $isReadOnly) {
            foreach (self::FILES_ACCESS_BY_LEGACY_FILES_SCOPE as $legacyFilesScope => $filesAccess) {
                foreach (self::MCP_ACCESS_BY_LEGACY_SCOPES as $legacyScopes => $mcpAccess) {
                    $sequence++;
                    $keyPrefix = $sequence % 2 === 0
                        ? 'ek_'.str_pad((string) $sequence, 9, '0', STR_PAD_LEFT)
                        : 'ek_'.str_pad((string) $sequence, 13, 'x', STR_PAD_LEFT);

                    $apiKeyId = DB::table('api_keys')->insertGetId([
                        'uuid' => sprintf('00000000-0000-4000-8000-%012d', $sequence),
                        'name' => 'Upgrade rehearsal key '.$sequence,
                        'key_prefix' => $keyPrefix,
                        'key_hash' => hash('sha256', 'upgrade-rehearsal-secret-'.$sequence),
                        'role_id' => $roleId,
                        'collection_slugs' => $sequence % 4 === 0 ? '["posts","pages"]' : null,
                        'read_only' => $isReadOnly,
                        'files_scope' => $legacyFilesScope,
                        'scopes' => $legacyScopes === '' ? null : $legacyScopes,
                        'ip_allowlist' => $sequence % 6 === 0 ? '["10.0.0.0/8"]' : null,
                        'rate_limit_per_minute' => $sequence % 5 === 0 ? 120 : null,
                        'expires_at' => $sequence % 7 === 0 ? '2026-05-06 07:08:09' : null,
                        'last_used_at' => $sequence % 3 === 0 ? '2026-06-07 08:09:10' : null,
                        'revoked_at' => $sequence % 5 === 1 ? '2026-07-08 09:10:11' : null,
                        'created_at' => self::FIXTURE_CREATED_AT,
                        'updated_at' => self::FIXTURE_UPDATED_AT,
                    ]);

                    $scopesByApiKeyId[(string) $apiKeyId] = self::expectedApiKeyScopes($isReadOnly, $filesAccess, $mcpAccess);
                }
            }
        }

        return $scopesByApiKeyId;
    }

    /**
     * The docblock's translation: collections are always granted, write unless read-only;
     * `read_only` turns every granted scope into its `:read` form; the list is sorted.
     *
     * @return list<string>
     */
    private static function expectedApiKeyScopes(bool $isReadOnly, ?string $filesAccess, ?string $mcpAccess): array
    {
        $accessByResource = array_filter(
            ['collections' => 'write', 'files' => $filesAccess, 'mcp' => $mcpAccess],
            fn (?string $access): bool => $access !== null,
        );
        $expectedScopes = [];

        foreach ($accessByResource as $resource => $access) {
            $expectedScopes[] = $resource.':'.($isReadOnly ? 'read' : $access);
        }

        sort($expectedScopes);

        return $expectedScopes;
    }

    /**
     * Eleven projects' `appearance.theme_preset` rows (with their brand hexes) covering every
     * branch of the rename: the five renames, the removed `blue`, an unknown slug, a current
     * slug, a light and a dark custom hex, and an empty hex.
     *
     * @return array<string, string|null> expected preset (null = left alone) by settings id
     */
    private static function seedThemePresets(): array
    {
        $presetsBySettingId = [];

        foreach (self::THEME_PRESET_PROJECTS as $offset => $themePresetProject) {
            $projectId = self::FIRST_FIXTURE_PROJECT_ID + $offset;
            $appearanceValues = array_filter([
                'theme_preset' => $themePresetProject['preset'],
                'project_color' => $themePresetProject['projectColor'],
                'project_color_dark' => $themePresetProject['projectColorDark'],
            ], fn (?string $value): bool => $value !== null);

            foreach ($appearanceValues as $key => $value) {
                $settingId = DB::table('settings')->insertGetId([
                    'scope' => 'project',
                    'scope_id' => $projectId,
                    'group' => 'appearance',
                    'key' => $key,
                    'value' => json_encode($value),
                    'created_at' => self::FIXTURE_CREATED_AT,
                    'updated_at' => self::FIXTURE_UPDATED_AT,
                ]);

                if ($key === 'theme_preset') {
                    $presetsBySettingId[(string) $settingId] = $themePresetProject['expectedPreset'];
                }
            }
        }

        return $presetsBySettingId;
    }

    /**
     * Custom roles with an active and a revoked API key each, so the restrict-on-delete
     * migration is rehearsed against real `api_keys.role_id` rows (docblock: no row changes;
     * a raw DELETE of a referenced role must fail afterwards).
     *
     * @return array{roleIds: list<string>, apiKeyIds: list<string>}
     */
    private static function seedApiKeysBoundToCustomRoles(): array
    {
        $roleIds = [];
        $apiKeyIds = [];

        foreach (['active', 'revoked'] as $offset => $state) {
            $roleId = DB::table('roles')->insertGetId([
                'name' => 'upgrade-role-restrict-'.$state,
                'guard_name' => 'web',
                'created_at' => self::FIXTURE_CREATED_AT,
                'updated_at' => self::FIXTURE_UPDATED_AT,
            ]);
            $roleIds[] = (string) $roleId;

            $row = [
                'uuid' => sprintf('00000000-0000-4000-a000-%012d', $offset + 1),
                'name' => 'Upgrade role-restrict '.$state,
                'key_prefix' => 'ek_restr'.str_pad((string) ($offset + 1), 4, '0', STR_PAD_LEFT),
                'key_hash' => hash('sha256', 'upgrade-role-restrict-'.$state),
                'role_id' => $roleId,
                'scopes' => '["collections:read"]',
                'revoked_at' => $state === 'revoked' ? '2026-07-08 09:10:11' : null,
                'created_at' => self::FIXTURE_CREATED_AT,
                'updated_at' => self::FIXTURE_UPDATED_AT,
            ];

            if (Schema::hasColumn('api_keys', 'owner_id')) {
                $row['owner_id'] = null;
            }

            $apiKeyIds[] = (string) DB::table('api_keys')->insertGetId($row);
        }

        return ['roleIds' => $roleIds, 'apiKeyIds' => $apiKeyIds];
    }

    /**
     * Tool calls from before the column existed: their `api_key_id` must stay null.
     *
     * @return list<string> pending tool call ids
     */
    private static function seedPendingToolCalls(): array
    {
        $pendingToolCallIds = [];

        foreach (['pending', 'approved'] as $sequence => $status) {
            $pendingToolCallIds[] = (string) DB::table('pending_tool_calls')->insertGetId([
                'uuid' => sprintf('00000000-0000-4000-9000-%012d', $sequence + 1),
                'tool' => 'create-collection-item',
                'surface' => 'mcp',
                'arguments' => '{"collection":"posts"}',
                'status' => $status,
                'expires_at' => '2026-08-09 10:11:12',
                'resolved_at' => $status === 'approved' ? '2026-08-09 09:10:11' : null,
                'created_at' => self::FIXTURE_CREATED_AT,
                'updated_at' => self::FIXTURE_UPDATED_AT,
            ]);
        }

        return $pendingToolCallIds;
    }

    /**
     * Whether a seeded migration's docblock says it rewrites this value: an api key's `scopes`,
     * or a theme preset row's value and `updated_at` (checked by {@see themePresetViolations()}).
     *
     * @param  list<string>  $seededGroups
     * @param  array<string, string|null>  $rowBefore
     */
    private static function isRewrittenByAMigration(array $seededGroups, string $table, array $rowBefore, string $column): bool
    {
        if ($table === 'api_keys' && $column === 'scopes') {
            return in_array(self::API_KEY_SCOPES_MIGRATION, $seededGroups, true);
        }

        return $table === 'settings'
            && in_array($column, ['value', 'updated_at'], true)
            && $rowBefore['scope'] === 'project'
            && $rowBefore['group'] === 'appearance'
            && $rowBefore['key'] === 'theme_preset'
            && in_array(self::THEME_PRESETS_MIGRATION, $seededGroups, true);
    }

    /**
     * After the restrict migration, `api_keys.role_id` must be restrict/no action, and every
     * seeded key/role row must still exist (docblock: no row changes).
     *
     * @param  array{roleIds: list<string>, apiKeyIds: list<string>}  $expectations
     * @return list<string>
     */
    private static function apiKeysRoleRestrictViolations(array $expectations): array
    {
        $violations = [];

        foreach ($expectations['apiKeyIds'] as $apiKeyId) {
            if (! DB::table('api_keys')->where('id', $apiKeyId)->exists()) {
                $violations[] = "api_keys row {$apiKeyId} is lost after the role-restrict migration.";
            }
        }

        foreach ($expectations['roleIds'] as $roleId) {
            if (! DB::table('roles')->where('id', $roleId)->exists()) {
                $violations[] = "roles row {$roleId} is lost after the role-restrict migration.";
            }
        }

        $roleForeignKey = null;

        foreach (Schema::getForeignKeys('api_keys') as $foreignKey) {
            if ($foreignKey['columns'] === ['role_id']) {
                $roleForeignKey = $foreignKey;

                break;
            }
        }

        $onDelete = strtolower((string) ($roleForeignKey['on_delete'] ?? ''));

        if ($roleForeignKey === null || ! in_array($onDelete, ['restrict', 'no action'], true)) {
            $violations[] = 'api_keys.role_id foreign key must use restrictOnDelete after the migration, got '
                .($roleForeignKey === null ? 'none' : var_export($roleForeignKey['on_delete'], true)).'.';
        }

        return $violations;
    }

    /**
     * @param  array<string, list<string>>  $scopesByApiKeyId
     * @param  array<string, array<string, string|null>>  $apiKeyRowsAfter
     * @return list<string>
     */
    private static function apiKeyScopeViolations(array $scopesByApiKeyId, array $apiKeyRowsAfter): array
    {
        $violations = [];

        foreach (['read_only', 'files_scope'] as $legacyColumn) {
            if (Schema::hasColumn('api_keys', $legacyColumn)) {
                $violations[] = "api_keys.{$legacyColumn} should be dropped.";
            }
        }

        foreach ($scopesByApiKeyId as $apiKeyId => $expectedScopes) {
            $storedScopes = $apiKeyRowsAfter[$apiKeyId]['scopes'] ?? null;
            $translatedScopes = $storedScopes === null ? null : json_decode($storedScopes, true);

            if ($translatedScopes !== $expectedScopes) {
                $violations[] = "api_keys row {$apiKeyId}: scopes are ".var_export($storedScopes, true).', expected '.json_encode($expectedScopes).'.';
            }
        }

        return $violations;
    }

    /**
     * @param  array<string, string|null>  $presetsBySettingId
     * @param  array<string, array<string, string|null>>  $settingRowsBefore
     * @param  array<string, array<string, string|null>>  $settingRowsAfter
     * @return list<string>
     */
    private static function themePresetViolations(array $presetsBySettingId, array $settingRowsBefore, array $settingRowsAfter): array
    {
        $violations = [];

        foreach ($presetsBySettingId as $settingId => $expectedPreset) {
            $rowBefore = $settingRowsBefore[$settingId];
            $rowAfter = $settingRowsAfter[$settingId] ?? null;

            if ($rowAfter === null) {
                continue;
            }

            if ($expectedPreset === null) {
                if ($rowAfter !== $rowBefore) {
                    $violations[] = "settings row {$settingId}: a project with a custom brand hex must be left alone, got value {$rowAfter['value']} updated at {$rowAfter['updated_at']}.";
                }

                continue;
            }

            $storedPreset = $rowAfter['value'] === null ? null : json_decode($rowAfter['value'], true);

            if ($storedPreset !== $expectedPreset) {
                $violations[] = "settings row {$settingId}: theme preset is ".var_export($storedPreset, true).", expected {$expectedPreset}.";
            }
        }

        return $violations;
    }

    /**
     * Every row of every table, keyed by `id` (or by the row's content when there is none),
     * with values as strings so a snapshot compares equal across processes and JSON.
     *
     * @return array<string, array{keyColumn: string|null, rows: array<string, array<string, string|null>>}>
     */
    private static function snapshotTables(): array
    {
        $tables = [];

        // The connection's own schema only: MySQL and MariaDB list every database otherwise.
        foreach (Schema::getTableListing(Schema::getCurrentSchemaListing(), schemaQualified: false) as $table) {
            $hasIdColumn = Schema::hasColumn($table, 'id');
            $query = DB::table($table);
            $rows = [];

            foreach (($hasIdColumn ? $query->orderBy('id') : $query)->get() as $row) {
                $normalizedRow = array_map(self::normalizedValue(...), (array) $row);
                $rowKey = $hasIdColumn ? (string) $normalizedRow['id'] : (string) json_encode($normalizedRow, JSON_INVALID_UTF8_SUBSTITUTE);
                $rows[$rowKey] = $normalizedRow;
            }

            $tables[$table] = ['keyColumn' => $hasIdColumn ? 'id' : null, 'rows' => $rows];
        }

        return self::roundTripped($tables);
    }

    private static function normalizedValue(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        if (is_bool($value)) {
            return $value ? '1' : '0';
        }

        return is_scalar($value) ? (string) $value : (string) json_encode($value);
    }

    /**
     * The value as it comes back from a JSON file, so an in-process snapshot and one read back
     * by the e2e script compare the same way.
     *
     * @template TValue of array
     *
     * @param  TValue  $value
     * @return TValue
     */
    private static function roundTripped(array $value): array
    {
        return json_decode((string) json_encode($value, JSON_INVALID_UTF8_SUBSTITUTE), true);
    }

    private static function migrationsTable(): string
    {
        $migrationsTable = config('database.migrations.table', 'migrations');

        return is_array($migrationsTable) ? (string) ($migrationsTable['table'] ?? 'migrations') : (string) $migrationsTable;
    }
}

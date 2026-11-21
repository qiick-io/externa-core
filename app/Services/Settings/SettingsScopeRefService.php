<?php

declare(strict_types=1);

namespace App\Services\Settings;

use Illuminate\Contracts\Cache\Repository;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Backfill and dedupe for `settings.scope_ref` (#827 step 4).
 *
 * Instance rows use `scope_ref = ''` (never NULL) so the unique index refuses duplicates on
 * every engine. Non-null `scope_id` values become their decimal string. Duplicate rows on
 * `(scope, scope_ref, group, key)` keep the latest non-null `updated_at` (NULL loses to any
 * timestamp; then highest `id`); losers are archived then deleted.
 *
 * Dry-run and duplicate discovery work before the migration adds `scope_ref`: identity is
 * computed from `scope_id` when the column is missing.
 */
final class SettingsScopeRefService
{
    private const string CACHE_KEY = 'schema.columns.settings.scope_ref';

    private const string CACHE_STORE = 'file';

    private static ?bool $hasScopeRefColumn = null;

    /**
     * How many rows still need `scope_ref` aligned with `scope_id` (null → '').
     *
     * Before the column exists every row needs backfill.
     */
    public function rowsNeedingBackfill(): int
    {
        if (! $this->hasScopeRefColumn()) {
            return (int) DB::table('settings')->count();
        }

        $needing = 0;

        DB::table('settings')
            ->orderBy('id')
            ->chunkById(500, function (Collection $settingRows) use (&$needing): void {
                foreach ($settingRows as $settingRow) {
                    if ((string) $settingRow->scope_ref !== $this->effectiveScopeRef($settingRow)) {
                        $needing++;
                    }
                }
            });

        return $needing;
    }

    /**
     * Copy `scope_id` into `scope_ref` (null → '') with one UPDATE. Idempotent.
     *
     * @return int Rows updated
     */
    public function backfill(): int
    {
        if (! $this->hasScopeRefColumn()) {
            return 0;
        }

        $driver = Schema::getConnection()->getDriverName();

        // One UPDATE for the whole table (idempotent); engines differ on casting bigint → text.
        $sql = match ($driver) {
            'pgsql' => "update settings set scope_ref = coalesce(scope_id::text, '')",
            'mysql', 'mariadb' => "update settings set scope_ref = ifnull(cast(scope_id as char), '')",
            default => "update settings set scope_ref = coalesce(cast(scope_id as text), '')",
        };

        return DB::affectingStatement($sql);
    }

    /**
     * Duplicate groups on (scope, scope_ref, group, key), as counts of rows that would be dropped.
     *
     * @return array{groups: int, rows_to_drop: int}
     */
    public function duplicateCounts(): array
    {
        $duplicateGroups = $this->duplicateGroups();
        $rowsToDrop = 0;

        foreach ($duplicateGroups as $duplicateGroup) {
            $rowsToDrop += $duplicateGroup['row_count'] - 1;
        }

        return [
            'groups' => $duplicateGroups->count(),
            'rows_to_drop' => $rowsToDrop,
        ];
    }

    /**
     * Every settings row that dedupe would delete (full row attributes), for dry-run listing.
     *
     * Works before `scope_ref` exists: identity is derived from `scope_id`.
     *
     * @return Collection<int, \stdClass>
     */
    public function rowsThatWouldBeDropped(): Collection
    {
        $dropped = collect();

        foreach ($this->duplicateGroups() as $duplicateGroup) {
            $ordered = $this->orderedRowsForGroup($duplicateGroup);
            $dropped = $dropped->merge($ordered->slice(1));
        }

        return $dropped->values();
    }

    /**
     * Drop duplicate (scope, scope_ref, group, key) rows; keep latest non-null updated_at then highest id.
     *
     * Side effects: archives each loser into `settings_dedupe_archive`, then deletes it; logs each drop.
     *
     * @return int Number of rows deleted
     */
    public function dedupe(): int
    {
        $duplicateGroups = $this->duplicateGroups();

        if ($duplicateGroups->isNotEmpty() && ! Schema::hasTable('settings_dedupe_archive')) {
            throw new \RuntimeException(
                'settings_dedupe_archive is missing; refusing to delete duplicate settings without an archive. Run the scope_ref migration first (or create the archive table).'
            );
        }

        $deleted = 0;

        foreach ($duplicateGroups as $duplicateGroup) {
            $keepersAndLosers = $this->orderedRowsForGroup($duplicateGroup);
            $keeper = $keepersAndLosers->first();
            $losers = $keepersAndLosers->slice(1);

            foreach ($losers as $loser) {
                $this->archiveDroppedRow($loser, $keeper?->id);

                Log::warning('settings.scope_ref dedupe dropped duplicate', [
                    'dropped_id' => $loser->id,
                    'kept_id' => $keeper?->id,
                    'scope' => $duplicateGroup['scope'],
                    'scope_ref' => $duplicateGroup['scope_ref'],
                    'group' => $duplicateGroup['group'],
                    'key' => $duplicateGroup['key'],
                    'dropped_updated_at' => $loser->updated_at,
                    'kept_updated_at' => $keeper?->updated_at,
                ]);

                DB::table('settings')->where('id', $loser->id)->delete();
                $deleted++;
            }
        }

        return $deleted;
    }

    /**
     * Map a nullable bigint scope_id to the scope_ref sentinel / string.
     */
    public static function scopeRefFromScopeId(?int $scopeId): string
    {
        return $scopeId === null ? '' : (string) $scopeId;
    }

    /**
     * Whether `settings.scope_ref` exists.
     *
     * Only a positive probe is memoised (per process and across HTTP requests via the file cache):
     * a shared "missing" must not stick across parallel Pest workers. Tests use the array store so
     * Pest workers with divergent schemas do not race on a shared file cache.
     * {@see forgetScopeRefColumnCache()} clears both (called by `externa:upgrade` after migrate
     * and by the scope_ref migration).
     *
     * @throws \Throwable when the schema probe fails (DB unreachable); never treat that as "missing".
     */
    public function hasScopeRefColumn(): bool
    {
        if (self::$hasScopeRefColumn === true) {
            return true;
        }

        if (self::probeCache()->get(self::CACHE_KEY) === true) {
            return self::$hasScopeRefColumn = true;
        }

        $exists = Schema::hasColumn('settings', 'scope_ref');

        if ($exists) {
            self::$hasScopeRefColumn = true;
            self::probeCache()->forever(self::CACHE_KEY, true);
        }

        return $exists;
    }

    /**
     * Forget the cached column probe (upgrade after migrate; tests that drop/add mid-run).
     */
    public static function forgetScopeRefColumnCache(): void
    {
        self::$hasScopeRefColumn = null;
        self::probeCache()->forget(self::CACHE_KEY);
    }

    /**
     * File store across HTTP requests; array store in tests (Pest parallel workers share the filesystem).
     */
    private static function probeCache(): Repository
    {
        return Cache::store(app()->runningUnitTests() ? 'array' : self::CACHE_STORE);
    }

    /**
     * Groups with more than one row on (scope, effective scope_ref, group, key).
     *
     * @return Collection<int, array{scope: string, scope_ref: string, group: string, key: string, row_count: int}>
     */
    private function duplicateGroups(): Collection
    {
        /** @var array<string, array{scope: string, scope_ref: string, group: string, key: string, row_count: int}> $countsByIdentity */
        $countsByIdentity = [];

        DB::table('settings')
            ->orderBy('id')
            ->chunkById(500, function (Collection $settingRows) use (&$countsByIdentity): void {
                foreach ($settingRows as $settingRow) {
                    $scopeRef = $this->effectiveScopeRef($settingRow);
                    $identityKey = $settingRow->scope."\0".$scopeRef."\0".$settingRow->group."\0".$settingRow->key;

                    if (! isset($countsByIdentity[$identityKey])) {
                        $countsByIdentity[$identityKey] = [
                            'scope' => (string) $settingRow->scope,
                            'scope_ref' => $scopeRef,
                            'group' => (string) $settingRow->group,
                            'key' => (string) $settingRow->key,
                            'row_count' => 0,
                        ];
                    }

                    $countsByIdentity[$identityKey]['row_count']++;
                }
            });

        /** @var list<array{scope: string, scope_ref: string, group: string, key: string, row_count: int}> $duplicates */
        $duplicates = [];

        foreach ($countsByIdentity as $group) {
            if ($group['row_count'] > 1) {
                $duplicates[] = $group;
            }
        }

        return collect($duplicates);
    }

    /**
     * Rows for one identity, keeper first: non-null updated_at wins over NULL, then latest, then highest id.
     *
     * @param  array{scope: string, scope_ref: string, group: string, key: string, row_count: int}  $duplicateGroup
     * @return Collection<int, \stdClass>
     */
    private function orderedRowsForGroup(array $duplicateGroup): Collection
    {
        $query = DB::table('settings')
            ->where('scope', $duplicateGroup['scope'])
            ->where('group', $duplicateGroup['group'])
            ->where('key', $duplicateGroup['key']);

        if ($this->hasScopeRefColumn()) {
            $query->where('scope_ref', $duplicateGroup['scope_ref']);
        } elseif ($duplicateGroup['scope_ref'] === '') {
            $query->whereNull('scope_id');
        } else {
            $query->where('scope_id', (int) $duplicateGroup['scope_ref']);
        }

        // Sort in PHP so NULL updated_at loses on every engine (no orderByRaw / driver NULL quirks).
        return $query->get()->sort(function (\stdClass $left, \stdClass $right): int {
            $leftIsNull = $left->updated_at === null;
            $rightIsNull = $right->updated_at === null;

            if ($leftIsNull !== $rightIsNull) {
                return $leftIsNull ? 1 : -1;
            }

            if (! $leftIsNull && $left->updated_at !== $right->updated_at) {
                return $right->updated_at <=> $left->updated_at;
            }

            return ((int) $right->id) <=> ((int) $left->id);
        })->values();
    }

    /**
     * @param  \stdClass  $settingRow  a settings table row (with or without scope_ref)
     */
    private function effectiveScopeRef(\stdClass $settingRow): string
    {
        if ($this->hasScopeRefColumn() && property_exists($settingRow, 'scope_ref')) {
            return (string) $settingRow->scope_ref;
        }

        $scopeId = $settingRow->scope_id === null ? null : (int) $settingRow->scope_id;

        return self::scopeRefFromScopeId($scopeId);
    }

    /**
     * Persist the full settings row before delete so encrypted values are recoverable.
     */
    private function archiveDroppedRow(\stdClass $loser, int|string|null $keptId): void
    {
        if (! Schema::hasTable('settings_dedupe_archive')) {
            throw new \RuntimeException(
                'settings_dedupe_archive is missing; refusing to delete settings id '.$loser->id.' without an archive.'
            );
        }

        $payload = [
            'id' => $loser->id,
            'scope' => $loser->scope,
            'scope_id' => $loser->scope_id,
            'group' => $loser->group,
            'key' => $loser->key,
            'value' => $loser->value,
            'created_at' => $loser->created_at,
            'updated_at' => $loser->updated_at,
            'reason' => 'duplicate_instance_scope_ref; kept_id='.($keptId ?? 'none'),
            'migrated_at' => now(),
        ];

        if ($this->hasScopeRefColumn() && property_exists($loser, 'scope_ref')) {
            $payload['scope_ref'] = $loser->scope_ref;
        } else {
            $payload['scope_ref'] = $this->effectiveScopeRef($loser);
        }

        DB::table('settings_dedupe_archive')->insertOrIgnore($payload);
    }
}

<?php

declare(strict_types=1);

namespace App\Services\Settings;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Backfill and dedupe for `settings.scope_ref` (#827 step 4).
 *
 * Instance rows use `scope_ref = ''` (never NULL) so the unique index refuses duplicates on
 * every engine. Non-null `scope_id` values become their decimal string. Duplicate rows on
 * `(scope, scope_ref, group, key)` keep the latest `updated_at` (then highest `id`); the rest
 * are deleted and logged.
 */
final class SettingsScopeRefService
{
    /**
     * How many rows still need `scope_ref` aligned with `scope_id` (null → '').
     */
    public function rowsNeedingBackfill(): int
    {
        $needing = 0;

        DB::table('settings')
            ->orderBy('id')
            ->chunkById(500, function (Collection $settingRows) use (&$needing): void {
                foreach ($settingRows as $settingRow) {
                    $scopeId = $settingRow->scope_id === null ? null : (int) $settingRow->scope_id;

                    if ((string) $settingRow->scope_ref !== self::scopeRefFromScopeId($scopeId)) {
                        $needing++;
                    }
                }
            });

        return $needing;
    }

    /**
     * Copy `scope_id` into `scope_ref` (null → ''). Idempotent.
     *
     * @return int Rows updated
     */
    public function backfill(): int
    {
        $updated = 0;

        DB::table('settings')
            ->orderBy('id')
            ->chunkById(500, function (Collection $settingRows) use (&$updated): void {
                foreach ($settingRows as $settingRow) {
                    $scopeId = $settingRow->scope_id === null ? null : (int) $settingRow->scope_id;
                    $expected = self::scopeRefFromScopeId($scopeId);

                    if ((string) $settingRow->scope_ref === $expected) {
                        continue;
                    }

                    DB::table('settings')
                        ->where('id', $settingRow->id)
                        ->update(['scope_ref' => $expected]);
                    $updated++;
                }
            });

        return $updated;
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
            $rowsToDrop += ((int) $duplicateGroup->row_count) - 1;
        }

        return [
            'groups' => $duplicateGroups->count(),
            'rows_to_drop' => $rowsToDrop,
        ];
    }

    /**
     * Drop duplicate (scope, scope_ref, group, key) rows; keep latest updated_at then highest id.
     *
     * Side effects: deletes settings rows; logs each dropped id.
     *
     * @return int Number of rows deleted
     */
    public function dedupe(): int
    {
        $deleted = 0;

        foreach ($this->duplicateGroups() as $duplicateGroup) {
            $keepersAndLosers = DB::table('settings')
                ->where('scope', $duplicateGroup->scope)
                ->where('scope_ref', $duplicateGroup->scope_ref)
                ->where('group', $duplicateGroup->group)
                ->where('key', $duplicateGroup->key)
                ->orderByDesc('updated_at')
                ->orderByDesc('id')
                ->get(['id', 'updated_at', 'value']);

            $keeper = $keepersAndLosers->first();
            $losers = $keepersAndLosers->slice(1);

            foreach ($losers as $loser) {
                Log::warning('settings.scope_ref dedupe dropped duplicate', [
                    'dropped_id' => $loser->id,
                    'kept_id' => $keeper?->id,
                    'scope' => $duplicateGroup->scope,
                    'scope_ref' => $duplicateGroup->scope_ref,
                    'group' => $duplicateGroup->group,
                    'key' => $duplicateGroup->key,
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
     * @return Collection<int, object{scope: string, scope_ref: string, group: string, key: string, row_count: int|string}>
     */
    private function duplicateGroups(): Collection
    {
        return DB::table('settings')
            ->select('scope', 'scope_ref', 'group', 'key', DB::raw('COUNT(*) as row_count'))
            ->groupBy('scope', 'scope_ref', 'group', 'key')
            ->havingRaw('COUNT(*) > 1')
            ->get();
    }
}

<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Settings\SettingsScopeRefService;
use Illuminate\Console\Command;

/**
 * Idempotent `settings.scope_ref` backfill and duplicate-instance dedupe (#827 step 4).
 */
final class BackfillSettingsScopeRefCommand extends Command
{
    protected $signature = 'settings:backfill-scope-ref
        {--dry-run : Print backfill and dedupe counts without writing}';

    protected $description = 'Backfill settings.scope_ref from scope_id and drop duplicate instance rows';

    /**
     * Side effects: updates `scope_ref` and may delete duplicate settings rows unless `--dry-run`.
     */
    public function handle(SettingsScopeRefService $scopeRef): int
    {
        $isDryRun = (bool) $this->option('dry-run');
        $needingBackfill = $scopeRef->rowsNeedingBackfill();
        $duplicateCounts = $scopeRef->duplicateCounts();

        if ($isDryRun) {
            $this->info("[dry-run] settings needing scope_ref backfill: {$needingBackfill}");
            $this->info("[dry-run] duplicate groups: {$duplicateCounts['groups']}; rows that would be dropped: {$duplicateCounts['rows_to_drop']}");

            return self::SUCCESS;
        }

        $backfilled = $scopeRef->backfill();
        $deleted = $scopeRef->dedupe();

        $this->info("Backfilled scope_ref on {$backfilled} setting(s); dropped {$deleted} duplicate row(s).");

        return self::SUCCESS;
    }
}

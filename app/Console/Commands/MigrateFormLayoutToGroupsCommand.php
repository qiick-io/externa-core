<?php

namespace App\Console\Commands;

use App\Services\Collections\MigrateFormLayoutToGroupsService;
use Illuminate\Console\Command;

/**
 * Migrate legacy collections.form_layout JSON into layout group fields.
 */
class MigrateFormLayoutToGroupsCommand extends Command
{
    protected $signature = 'collections:migrate-form-layout-to-groups {--dry-run : Estimate without writing}';

    protected $description = 'Convert collections.form_layout tabs/sections into group_* fields and clear form_layout';

    public function handle(MigrateFormLayoutToGroupsService $migrator): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $result = $migrator->migrateAll($dryRun);

        $prefix = $dryRun ? '[dry-run] ' : '';
        $this->info($prefix.sprintf(
            'Migrated %d collection(s), skipped %d, created ~%d group field(s).',
            $result['migrated'],
            $result['skipped'],
            $result['created_fields'],
        ));

        return self::SUCCESS;
    }
}

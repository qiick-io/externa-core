<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Users\UserPublicIdBackfillService;
use Illuminate\Console\Command;

/**
 * Idempotent `users.public_id` UUID v7 backfill with a dry-run that prints counts (#827).
 */
final class BackfillUserPublicIdCommand extends Command
{
    protected $signature = 'users:backfill-public-id
        {--chunk=500 : Rows per chunk}
        {--dry-run : Print how many rows need a public_id without writing}';

    protected $description = 'Backfill users.public_id with UUID v7 for rows that still have null';

    /**
     * Side effects: updates `users.public_id` unless `--dry-run`.
     */
    public function handle(UserPublicIdBackfillService $backfill): int
    {
        $chunkOption = $this->option('chunk');
        $chunkSize = is_numeric($chunkOption) ? max(1, (int) $chunkOption) : 500;
        $isDryRun = (bool) $this->option('dry-run');
        $missing = $backfill->missingCount();

        if ($isDryRun) {
            $this->info("[dry-run] users missing public_id: {$missing}");

            return self::SUCCESS;
        }

        $written = $backfill->backfill($chunkSize);
        $remaining = $backfill->missingCount();

        $this->info("Backfilled public_id on {$written} user(s); remaining null: {$remaining}.");

        return self::SUCCESS;
    }
}

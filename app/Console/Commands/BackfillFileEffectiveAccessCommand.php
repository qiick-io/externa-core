<?php

namespace App\Console\Commands;

use App\Services\Files\FileEffectiveAccessService;
use Illuminate\Console\Command;

/**
 * Idempotent backfill of denormalized files.effective_access.
 */
class BackfillFileEffectiveAccessCommand extends Command
{
    protected $signature = 'files:backfill-effective-access {--chunk=500 : Rows per chunk}';

    protected $description = 'Recompute files.effective_access from access/parent inheritance';

    public function handle(FileEffectiveAccessService $effectiveAccess): int
    {
        $chunk = max(1, (int) $this->option('chunk'));
        $changed = $effectiveAccess->backfillAll($chunk);

        $this->info(sprintf('Updated effective_access on %d file(s).', $changed));

        return self::SUCCESS;
    }
}

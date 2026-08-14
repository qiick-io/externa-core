<?php

namespace App\Console\Commands;

use App\Services\Collections\CollectionItemRevisionPruner;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('collections:prune-revisions')]
#[Description('Prune collection item revisions past per-collection retention limits')]
/**
 * Artisan command that hard-deletes outdated collection item revision snapshots.
 */
class PruneCollectionItemRevisionsCommand extends Command
{
    /**
     * Delete revisions past count/days retention for limited collections.
     */
    public function handle(CollectionItemRevisionPruner $pruner): int
    {
        $deleted = $pruner->pruneAll();

        $this->info(sprintf('Pruned %d collection item revision(s).', $deleted));

        return self::SUCCESS;
    }
}

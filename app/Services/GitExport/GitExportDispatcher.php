<?php

namespace App\Services\GitExport;

use App\Jobs\GitExport\ExportCollectionItemToGitJob;
use App\Models\CollectionItem;

/**
 * Queues git export after publish when GIT_EXPORT_* is configured.
 */
class GitExportDispatcher
{
    public function __construct(
        private readonly GitExportRepository $repository,
        private readonly GitExportDocumentBuilder $builder,
    ) {}

    public function dispatchItem(CollectionItem $item): void
    {
        if (! $this->repository->enabled()) {
            return;
        }

        $item->loadMissing('collection');
        $collection = $item->collection;
        if ($collection === null || ! $this->builder->collectionAllowed($collection)) {
            return;
        }

        $pending = ExportCollectionItemToGitJob::dispatch((int) $item->id);
        if (! app()->runningUnitTests()) {
            $pending->afterCommit();
        }
    }
}

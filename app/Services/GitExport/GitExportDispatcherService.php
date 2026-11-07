<?php

namespace App\Services\GitExport;

use App\Jobs\GitExport\ExportCollectionItemToGitJob;
use App\Models\CollectionItem;

/**
 * Queues git export after publish when GIT_EXPORT_* is configured.
 */
class GitExportDispatcherService
{
    public function __construct(
        private readonly GitExportRepositoryService $repository,
        private readonly GitExportDocumentBuilderService $builder,
    ) {}

    public function dispatchItem(CollectionItem $item): void
    {
        if (! $this->repository->isEnabled()) {
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

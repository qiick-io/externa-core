<?php

namespace App\Jobs\GitExport;

use App\Models\CollectionItem;
use App\Services\GitExport\GitExportDocumentBuilder;
use App\Services\GitExport\GitExportRepository;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Write one published item into the git-export worktree and push (unless dry-run).
 */
class ExportCollectionItemToGitJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public int $timeout = 180;

    public function __construct(
        public readonly int $itemId,
    ) {}

    /**
     * @return list<int>
     */
    public function backoff(): array
    {
        return [30, 90];
    }

    public function handle(
        GitExportRepository $repository,
        GitExportDocumentBuilder $builder,
    ): void {
        if (! $repository->enabled()) {
            return;
        }

        $item = CollectionItem::query()->with('collection')->find($this->itemId);
        if (! $item instanceof CollectionItem) {
            return;
        }

        $document = $builder->build($item);
        if ($document === null) {
            return;
        }

        $repository->ensureRepository();
        $repository->writeFile($document['path'], $document['contents']);
        $repository->commitAndPush(sprintf(
            'export: %s#%d',
            $item->collection?->slug ?? 'collection',
            $item->id,
        ));
    }

    public function failed(?Throwable $exception): void
    {
        Log::warning('Git export exhausted retries', [
            'item_id' => $this->itemId,
            'message' => $exception?->getMessage(),
        ]);
    }
}

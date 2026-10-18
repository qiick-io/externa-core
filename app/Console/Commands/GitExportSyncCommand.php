<?php

namespace App\Console\Commands;

use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\GitExport\GitExportDocumentBuilder;
use App\Services\GitExport\GitExportRepository;
use Illuminate\Console\Command;

/**
 * Full (or dry-run) export of configured collections into the git worktree.
 */
class GitExportSyncCommand extends Command
{
    protected $signature = 'git-export:sync
                            {--dry-run : Write files and commit locally but skip push}
                            {--collection= : Limit to one collection slug}';

    protected $description = 'Export published collection items into the configured git-export repository';

    public function handle(
        GitExportRepository $repository,
        GitExportDocumentBuilder $builder,
    ): int {
        if ($this->option('dry-run')) {
            config(['git_export.dry_run' => true]);
        }

        if (! $repository->enabled() && ! $this->option('dry-run')) {
            // Allow dry-run write against a work dir even when remote unset — still need enabled+remote for push path.
            if (! config('git_export.enabled')) {
                $this->error('Git export disabled. Set GIT_EXPORT_ENABLED=true and GIT_EXPORT_REMOTE_URL.');

                return self::FAILURE;
            }
        }

        if (! config('git_export.enabled')) {
            config(['git_export.enabled' => true]);
        }

        if (! is_string(config('git_export.remote_url')) || trim((string) config('git_export.remote_url')) === '') {
            if ($this->option('dry-run')) {
                // Local-only dry-run: skip clone/push; just write under work_dir.
                $this->writeLocalOnly($builder);

                return self::SUCCESS;
            }

            $this->error('GIT_EXPORT_REMOTE_URL is required.');

            return self::FAILURE;
        }

        $repository->ensureRepository();
        $written = 0;

        foreach ($this->collections() as $collection) {
            if (! $builder->collectionAllowed($collection)) {
                continue;
            }

            $items = CollectionItem::query()
                ->where('collection_id', $collection->id)
                ->orderBy('id')
                ->get();

            foreach ($items as $item) {
                $item->setRelation('collection', $collection);
                $document = $builder->build($item);
                if ($document === null) {
                    continue;
                }
                $repository->writeFile($document['path'], $document['contents']);
                $written++;
            }
        }

        $repository->commitAndPush(sprintf('export: sync %d item(s)', $written));
        $this->info("Exported {$written} item file(s)".(config('git_export.dry_run') ? ' (dry-run, no push)' : '').'.');

        return self::SUCCESS;
    }

    private function writeLocalOnly(GitExportDocumentBuilder $builder): void
    {
        $dir = config('git_export.work_dir');
        $written = 0;
        foreach ($this->collections() as $collection) {
            if (! $builder->collectionAllowed($collection)) {
                continue;
            }
            foreach (CollectionItem::query()->where('collection_id', $collection->id)->orderBy('id')->get() as $item) {
                $item->setRelation('collection', $collection);
                $document = $builder->build($item);
                if ($document === null) {
                    continue;
                }
                $path = rtrim((string) $dir, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR.$document['path'];
                if (! is_dir(dirname($path))) {
                    mkdir(dirname($path), 0755, true);
                }
                file_put_contents($path, $document['contents']);
                $written++;
            }
        }
        $this->info("Wrote {$written} file(s) under {$dir} (local dry-run, no git).");
    }

    /**
     * @return list<Collection>
     */
    private function collections(): array
    {
        $slug = $this->option('collection');
        $query = Collection::query()->orderBy('id');
        if (is_string($slug) && $slug !== '') {
            $query->where('slug', $slug);
        }

        return $query->get()->all();
    }
}

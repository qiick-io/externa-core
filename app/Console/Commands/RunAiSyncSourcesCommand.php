<?php

namespace App\Console\Commands;

use App\Jobs\ImportCollectionJob;
use App\Models\AiSyncSource;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('ai:run-sync-sources')]
#[Description('Queue due AI remote collection sync sources')]
/**
 * Artisan command that runs configured AI sync sources on a schedule or demand.
 */
class RunAiSyncSourcesCommand extends Command
{
    /**
     * Execute the command.
     */
    /**
     * Queue import jobs for sync sources that are due to run.
     */
    public function handle(): int
    {
        $queued = 0;

        AiSyncSource::query()
            ->where('enabled', true)
            ->eachById(function (AiSyncSource $source) use (&$queued): void {
                if (
                    $source->last_run_at !== null
                    && $source->last_run_at->addMinutes($source->interval_minutes)->isFuture()
                ) {
                    return;
                }

                $source->update([
                    'last_run_at' => now(),
                    'last_status' => 'queued',
                ]);

                dispatch(new ImportCollectionJob(
                    userId: $source->user_id,
                    conversationId: null,
                    sourceType: 'remote_json',
                    url: $source->url,
                    collectionId: $source->collection_id,
                    upsertKey: $source->upsert_key,
                    authBearer: $source->auth_bearer,
                    syncSourceId: $source->id,
                ));
                $queued++;
            });

        $this->info("Queued {$queued} sync source(s).");

        return self::SUCCESS;
    }
}

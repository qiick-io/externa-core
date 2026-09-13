<?php

namespace App\Jobs;

use App\Ai\Tools\ImportCollectionCsv;
use App\Ai\Tools\ImportRemoteJson;
use App\Models\AiSyncSource;
use Illuminate\Auth\AuthManager;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Laravel\Ai\Tools\Request;
use Throwable;

/**
 * Queued collection import from CSV, Excel, or remote JSON with cache-backed status.
 */
class ImportCollectionJob implements ShouldQueue
{
    use Queueable;

    public const CACHE_HOURS = 24;

    public string $jobId;

    public function __construct(
        public readonly int $userId,
        public readonly ?string $conversationId,
        public readonly string $sourceType,
        public readonly ?string $attachmentId = null,
        public readonly ?string $url = null,
        public readonly ?int $collectionId = null,
        public readonly ?string $collectionName = null,
        public readonly ?string $upsertKey = null,
        public readonly bool $dryRun = false,
        public readonly ?string $authBearer = null,
        public readonly ?int $syncSourceId = null,
    ) {
        $this->jobId = (string) Str::uuid();

        $this->putStatus([
            'status' => 'queued',
            'processed' => 0,
            'total' => null,
            'message' => 'Importazione in coda.',
            'result' => null,
        ]);
    }

    /**
     * Run the import under the owning user's auth context and persist final status.
     */
    public function handle(AuthManager $auth): void
    {
        $queuedTotal = self::status($this->jobId)['total'] ?? null;

        $this->putStatus([
            'status' => 'running',
            'processed' => 0,
            'total' => $queuedTotal,
            'message' => 'Importazione in corso.',
            'result' => null,
        ]);

        $auth->loginUsingId($this->userId);
        request()->merge(['conversation_id' => $this->conversationId]);

        try {
            $result = $this->runImport();
            $summary = json_decode($result, true);
            $isFailure = str_starts_with($result, 'Error:') || ! is_array($summary);
            $processed = is_array($summary)
                ? (int) (($summary['created'] ?? 0) + ($summary['updated'] ?? 0) + ($summary['skipped'] ?? 0))
                : 0;

            $this->putStatus([
                'status' => $isFailure ? 'failed' : 'done',
                'processed' => $processed,
                'total' => is_array($summary)
                    ? ($summary['records_found'] ?? $processed)
                    : null,
                'message' => $isFailure ? $result : 'Importazione completata.',
                'result' => $summary,
            ]);

            if ($this->syncSourceId !== null) {
                AiSyncSource::query()->whereKey($this->syncSourceId)->update([
                    'last_status' => $isFailure ? 'failed' : 'done',
                ]);
            }
        } finally {
            $auth->logout();
        }
    }

    /**
     * Persist failed status when the job exhausts retries.
     */
    public function failed(?Throwable $exception): void
    {
        $this->putStatus([
            'status' => 'failed',
            'processed' => 0,
            'total' => null,
            'message' => $exception?->getMessage() ?? 'Importazione fallita.',
            'result' => null,
        ]);

        if ($this->syncSourceId !== null) {
            AiSyncSource::query()->whereKey($this->syncSourceId)->update([
                'last_status' => 'failed',
            ]);
        }
    }

    /**
     * Read cached import status for a job id.
     *
     * @return array<string, mixed>|null
     */
    public static function status(string $jobId): ?array
    {
        $status = Cache::get(self::cacheKey($jobId));

        return is_array($status) ? $status : null;
    }

    /**
     * Update queued status with an optional total row estimate.
     */
    public function setQueuedTotal(?int $total): void
    {
        $this->putStatus([
            'status' => 'queued',
            'processed' => 0,
            'total' => $total,
            'message' => 'Importazione in coda.',
            'result' => null,
        ]);
    }

    private function runImport(): string
    {
        $payload = [
            'attachment_id' => $this->attachmentId,
            'url' => $this->url,
            'collection_id' => $this->collectionId,
            'collection_name' => $this->collectionName,
            'upsert_key' => $this->upsertKey,
            'dry_run' => $this->dryRun,
            'auth_bearer' => $this->authBearer,
            'limit' => 500,
            'force_sync' => true,
        ];

        return match ($this->sourceType) {
            'csv', 'excel' => (string) (new ImportCollectionCsv)->handle(new Request($payload)),
            'remote_json' => (string) (new ImportRemoteJson)->handle(new Request($payload)),
            default => 'Error: Tipo sorgente non supportato.',
        };
    }

    /**
     * @param  array<string, mixed>  $status
     */
    private function putStatus(array $status): void
    {
        Cache::put(self::cacheKey($this->jobId), [
            'job_id' => $this->jobId,
            'user_id' => $this->userId,
            ...$status,
        ], now()->addHours(self::CACHE_HOURS));
    }

    private static function cacheKey(string $jobId): string
    {
        return 'ai:import-job:'.$jobId;
    }
}

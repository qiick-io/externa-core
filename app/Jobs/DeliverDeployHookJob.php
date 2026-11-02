<?php

namespace App\Jobs;

use App\Ai\Support\SafeRemoteUrlValidator;
use App\Services\Deploy\DeployHookStatusService;
use App\Services\Settings\ProjectSettingsService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

/**
 * POSTs to a stored deploy-hook URL (Vercel / Netlify / Cloudflare Pages / Forge).
 */
class DeliverDeployHookJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 15;

    /**
     * @param  list<string>  $triggeredHookIds
     */
    public function __construct(
        public readonly string $hookId,
        public readonly string $hookName,
        public readonly string $source,
        public readonly array $triggeredHookIds = [],
    ) {}

    /**
     * @return list<int>
     */
    public function backoff(): array
    {
        return [10, 30, 60];
    }

    public function handle(ProjectSettingsService $projectSettings): void
    {
        $hook = $projectSettings->deployHookById($this->hookId);
        if ($hook === null) {
            return;
        }

        if ($ssrf = SafeRemoteUrlValidator::validateOutboundWebhook($hook->url)) {
            Log::warning('Deploy hook delivery refused: SSRF guard', [
                'hook_id' => $this->hookId,
                'reason' => $ssrf,
            ]);

            $this->recordOutcome(fn (DeployHookStatusService $status) => $status->recordFailure(
                $this->hookId,
                $this->hookName,
                $ssrf,
                $this->source,
                $this->triggeredHookIds,
            ));

            return;
        }

        $response = Http::timeout(5)
            ->connectTimeout(3)
            ->withoutRedirecting()
            ->withHeaders([
                'User-Agent' => 'Externa-Deploy/1.0',
            ])
            ->asJson()
            ->post($hook->url, [
                'source' => 'externa',
                'hook_id' => $this->hookId,
                'hook_name' => $this->hookName,
            ]);

        if (! $response->successful()) {
            throw new RuntimeException(sprintf(
                'Deploy hook delivery failed (%s): HTTP %s',
                $this->hookId,
                $response->status(),
            ));
        }

        $this->recordOutcome(fn (DeployHookStatusService $status) => $status->recordSuccess(
            $this->hookId,
            $this->hookName,
            $response->status(),
            $this->source,
            $this->triggeredHookIds,
        ));
    }

    public function failed(?Throwable $exception): void
    {
        Log::warning('Deploy hook delivery exhausted retries', [
            'hook_id' => $this->hookId,
            'message' => $exception?->getMessage(),
        ]);

        $this->recordOutcome(fn (DeployHookStatusService $status) => $status->recordFailure(
            $this->hookId,
            $this->hookName,
            $exception?->getMessage(),
            $this->source,
            $this->triggeredHookIds,
        ));
    }

    /**
     * @param  callable(DeployHookStatusService): void  $record
     */
    private function recordOutcome(callable $record): void
    {
        try {
            $record(app(DeployHookStatusService::class));
        } catch (Throwable $exception) {
            Log::warning('Deploy hook status not recorded', [
                'hook_id' => $this->hookId,
                'message' => $exception->getMessage(),
            ]);
        }
    }
}

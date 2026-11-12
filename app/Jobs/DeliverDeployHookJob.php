<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Ai\Support\SafeRemoteUrlValidator;
use App\Services\Deploy\DeployHookStatusService;
use App\Services\Settings\ProjectSettingsService;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

/**
 * POSTs to a stored deploy-hook URL (Vercel / Netlify / Cloudflare Pages / Forge).
 *
 * One queued delivery per hook at a time (unique until it starts): a scheduled publish of N
 * items queues one build per hook, not N. A publish that lands while a delivery is running
 * queues the next one, so the last published state is always built (#441).
 */
class DeliverDeployHookJob implements ShouldBeUniqueUntilProcessing, ShouldQueue
{
    use Queueable;

    /** Safety net: the unique lock expires even if a queued delivery is lost. */
    public int $uniqueFor = 600;

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

    public function uniqueId(): string
    {
        return $this->hookId;
    }

    /**
     * @return list<int>
     */
    public function backoff(): array
    {
        return [10, 30, 60];
    }

    public function handle(ProjectSettingsService $projectSettings): void
    {
        $hook = $projectSettings->integrations()->deployHookById($this->hookId);
        if ($hook === null) {
            return;
        }

        // Validate and resolve once, then pin the connection to that address (CURLOPT_RESOLVE),
        // so a DNS change between the check and the request cannot point it at a private host.
        $inspected = SafeRemoteUrlValidator::inspect(
            $hook->url,
            allowPrivateHosts: (bool) config('webhooks.allow_private_hosts', false),
            enforceHostAllowlist: false,
        );

        if ($ssrf = $inspected['error']) {
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

        $curlResolve = SafeRemoteUrlValidator::curlResolveEntries(
            (string) $inspected['host'],
            (int) $inspected['port'],
            $inspected['ips'],
        );

        $response = Http::timeout(5)
            ->connectTimeout(3)
            ->withoutRedirecting()
            ->withOptions([
                'curl' => $curlResolve === [] ? [] : [CURLOPT_RESOLVE => $curlResolve],
            ])
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

<?php

namespace App\Services\Deploy;

use App\Jobs\DeliverDeployHookJob;
use App\Services\Settings\ProjectSettingsService;

/**
 * Queues deploy-hook deliveries for manual trigger or publish-side effects.
 */
class DeployHookDispatcherService
{
    public const SOURCE_MANUAL = 'manual';

    public const SOURCE_PUBLISH = 'publish';

    /**
     * Publish-triggered builds wait this long, so a burst of publishes (a scheduled batch,
     * a bulk publish) collapses into one queued delivery per hook (#441).
     */
    public const PUBLISH_DEBOUNCE_SECONDS = 30;

    public function __construct(
        private readonly ProjectSettingsService $projectSettings,
    ) {}

    /**
     * Queue delivery for every configured hook (or a single id when provided).
     *
     * @return list<string> Triggered hook ids
     */
    public function dispatch(?string $hookId = null, string $source = self::SOURCE_MANUAL): array
    {
        $hooks = $this->projectSettings->deployHooks();
        if ($hooks === []) {
            return [];
        }

        if ($hookId !== null) {
            $hooks = array_values(array_filter(
                $hooks,
                fn ($hook): bool => $hook->id === $hookId,
            ));
        }

        if ($hooks === []) {
            return [];
        }

        $hookIds = array_map(fn ($hook): string => $hook->id, $hooks);

        foreach ($hooks as $hook) {
            $pending = DeliverDeployHookJob::dispatch(
                $hook->id,
                $hook->name,
                $source,
                $hookIds,
            );

            if ($source === self::SOURCE_PUBLISH) {
                $pending->delay(now()->addSeconds(self::PUBLISH_DEBOUNCE_SECONDS));
            }

            if (! app()->runningUnitTests()) {
                $pending->afterCommit();
            }
        }

        return $hookIds;
    }

    /**
     * Queue all hooks once when "deploy on publish" is enabled.
     *
     * @return list<string>
     */
    public function dispatchOnPublish(): array
    {
        if (! $this->projectSettings->isDeployOnPublishEnabled()) {
            return [];
        }

        return $this->dispatch(null, self::SOURCE_PUBLISH);
    }
}

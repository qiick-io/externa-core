<?php

namespace App\Actions\Deploy;

use App\Models\User;
use App\Services\Deploy\DeployHookDispatcherService;

/**
 * Trigger configured deploy hooks and write an activity-log entry.
 */
class TriggerDeployHooksAction
{
    public function __construct(
        private readonly DeployHookDispatcherService $dispatcher,
    ) {}

    /**
     * @return list<string> Triggered hook ids
     */
    public function execute(
        ?User $actor,
        ?string $hookId = null,
        string $source = DeployHookDispatcherService::SOURCE_MANUAL,
    ): array {
        $hookIds = $source === DeployHookDispatcherService::SOURCE_PUBLISH
            ? $this->dispatcher->dispatchOnPublish()
            : $this->dispatcher->dispatch($hookId, $source);

        if ($hookIds === []) {
            return [];
        }

        $activity = activity()
            ->useLog('deploy')
            ->event('deploy_triggered')
            ->withProperties([
                'hook_ids' => $hookIds,
                'source' => $source,
                'hook_id' => $hookId,
            ]);

        if ($actor !== null) {
            $activity->causedBy($actor);
        }

        $activity->log('Deploy hooks triggered');

        return $hookIds;
    }
}

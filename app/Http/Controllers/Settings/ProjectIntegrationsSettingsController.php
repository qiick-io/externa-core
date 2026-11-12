<?php

declare(strict_types=1);

namespace App\Http\Controllers\Settings;

use App\Actions\Deploy\TriggerDeployHooksAction;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Settings\Concerns\LogsProjectSettingsUpdateTrait;
use App\Http\Requests\Settings\TriggerDeployHooksRequest;
use App\Http\Requests\Settings\UpdateProjectIntegrationsSettingsRequest;
use App\Services\Deploy\DeployHookDispatcherService;
use App\Services\Deploy\DeployHookStatusService;
use App\Services\Settings\ProjectSettingsService;
use App\Services\Settings\SettingsRepositoryService;
use App\Services\Webhooks\OutboundWebhookCatalogService;
use App\Services\Webhooks\OutboundWebhookDeliveryLogService;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Integrations project settings (outbound webhooks + Slack/Telegram notifiers + deploy hooks).
 *
 * Test sends live in {@see ProjectIntegrationTestController}.
 */
class ProjectIntegrationsSettingsController extends Controller
{
    use LogsProjectSettingsUpdateTrait;

    public function __construct(
        private readonly ProjectSettingsService $projectSettings,
        private readonly SettingsRepositoryService $settings,
    ) {}

    /**
     * Render the integrations settings form.
     */
    public function edit(
        OutboundWebhookDeliveryLogService $deliveryLog,
        DeployHookStatusService $deployStatus,
    ): Response {
        return Inertia::render('settings/project/integrations', [
            'project' => $this->projectSettings->forEditOnly([
                'webhook_url',
                'webhook_secret_configured',
                'notifier_slack_webhook_url',
                'notifier_telegram_bot_token_configured',
                'notifier_telegram_chat_id',
                'notifier_event_types',
                'deploy_hooks',
                'deploy_on_publish',
            ]),
            'webhookEvents' => OutboundWebhookCatalogService::all(),
            'webhookDeliveries' => $deliveryLog->summary(),
            'deployLastRun' => $deployStatus->lastRun(),
        ]);
    }

    /**
     * Persist integrations settings.
     */
    public function update(UpdateProjectIntegrationsSettingsRequest $request): RedirectResponse
    {
        $values = $request->projectValues();

        $this->settings->setMany(
            SettingsRepositoryService::SCOPE_PROJECT,
            'project',
            $values,
        );

        $this->logProjectSettingsUpdate(
            $request,
            'integrations',
            $values,
            ['webhook_secret', 'notifier_telegram_bot_token'],
        );

        return to_route('project.integrations.edit');
    }

    /**
     * Queue POSTs to configured deploy hooks (permission: deploy.trigger).
     */
    public function triggerDeploy(TriggerDeployHooksRequest $request, TriggerDeployHooksAction $action): RedirectResponse
    {
        $hookIds = $action->execute(
            $request->user(),
            $request->hookId(),
            DeployHookDispatcherService::SOURCE_MANUAL,
        );

        if ($hookIds === []) {
            return back()->with('error', __('Configure at least one deploy hook before triggering a deploy.'));
        }

        return back()->with('success', __('Deploy queued for :count hook(s).', [
            'count' => count($hookIds),
        ]));
    }
}

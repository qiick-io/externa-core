<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\UpdateProjectSettingsRequest;
use App\Jobs\DeliverTelegramOutboundNotifierJob;
use App\Models\Role;
use App\Services\Notifiers\OutboundNotifierMessageFormatter;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use App\Services\Webhooks\OutboundWebhookCatalog;
use App\Services\Webhooks\OutboundWebhookDeliveryLog;
use App\Services\Webhooks\OutboundWebhookDispatcher;
use App\Support\Collections\ContentLocaleCatalog;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

/**
 * Project-level configuration (general, security, registration, files, reporting, webhooks).
 */
class ProjectSettingsController extends Controller
{
    public function __construct(
        private readonly ProjectSettings $projectSettings,
        private readonly SettingsRepository $settings,
    ) {}

    /**
     * Render the project settings form.
     */
    public function edit(OutboundWebhookDeliveryLog $deliveryLog): Response
    {
        $guard = config('auth.defaults.guard', 'web');

        return Inertia::render('settings/project', [
            'project' => $this->projectSettings->forEdit(),
            'roles' => Role::query()
                ->where('guard_name', $guard)
                ->where('is_assignable', true)
                ->orderBy('name')
                ->get(['id', 'name'])
                ->map(fn (Role $role): array => [
                    'id' => $role->id,
                    'name' => $role->name,
                ])
                ->values()
                ->all(),
            'availableLocales' => config('i18n.available_locales', ['en' => 'English']),
            'contentLocaleCatalog' => ContentLocaleCatalog::all(),
            'passwordPolicies' => config('settings.project.password_policies', ['medium']),
            'transformationOptions' => config('settings.project.allowed_transformations', ['thumbnail']),
            'transformFits' => config('settings.project.transform_fits', ['contain']),
            'transformFormats' => config('settings.project.transform_formats', ['auto']),
            'webhookEvents' => OutboundWebhookCatalog::all(),
            'webhookDeliveries' => $deliveryLog->summary(),
        ]);
    }

    /**
     * Persist project settings.
     */
    public function update(UpdateProjectSettingsRequest $request): RedirectResponse
    {
        $values = $request->projectValues();

        $this->settings->setMany(
            SettingsRepository::SCOPE_PROJECT,
            'project',
            $values,
        );

        $this->projectSettings->forgetPublicApiAllowedOriginsCache();

        $keys = array_keys($values);
        activity()
            ->causedBy($request->user())
            ->useLog('settings')
            ->event('settings_updated')
            ->withProperties([
                'scope' => SettingsRepository::SCOPE_PROJECT,
                'group' => 'project',
                'keys' => $keys,
                'secret_keys_updated' => count(array_intersect(
                    $keys,
                    ['webhook_secret', 'notifier_telegram_bot_token'],
                )) > 0,
            ])
            ->log('Project settings updated');

        return to_route('project.edit');
    }

    /**
     * Queue a signed `ping` webhook event to the configured URL.
     */
    public function sendTestWebhook(OutboundWebhookDispatcher $dispatcher): RedirectResponse
    {
        if ($this->projectSettings->webhookUrl() === null) {
            return to_route('project.edit')
                ->with('error', __('Configure a webhook URL before sending a test event.'));
        }

        if ($this->projectSettings->webhookSecret() === null) {
            return to_route('project.edit')
                ->with('error', __('Configure a webhook signing secret before sending a test event.'));
        }

        $dispatcher->dispatchPing();

        return to_route('project.edit')
            ->with('success', __('Test webhook event queued.'));
    }

    /**
     * Queue a `ping` notifier message to Slack when configured.
     */
    public function sendTestSlackNotifier(OutboundWebhookDispatcher $dispatcher): RedirectResponse
    {
        if ($this->projectSettings->notifierSlackWebhookUrl() === null) {
            return to_route('project.edit')
                ->with('error', __('Configure a Slack incoming webhook URL before sending a test message.'));
        }

        $dispatcher->dispatchPing();

        return to_route('project.edit')
            ->with('success', __('Test Slack notifier queued.'));
    }

    /**
     * Send a `ping` notifier message to Telegram immediately when configured.
     *
     * Runs synchronously so settings UI can surface Bot API errors without a queue worker.
     */
    public function sendTestTelegramNotifier(): RedirectResponse
    {
        if (! $this->projectSettings->notifierTelegramConfigured()) {
            return to_route('project.edit')
                ->with('error', __('Configure a Telegram bot token and chat ID before sending a test message.'));
        }

        $message = OutboundNotifierMessageFormatter::format('ping');

        try {
            (new DeliverTelegramOutboundNotifierJob('ping', $message))
                ->handle($this->projectSettings);
        } catch (Throwable $exception) {
            return to_route('project.edit')
                ->with('error', __('Telegram test failed: :error', [
                    'error' => $exception->getMessage(),
                ]));
        }

        return to_route('project.edit')
            ->with('success', __('Test Telegram message sent.'));
    }
}

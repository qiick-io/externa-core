<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\UpdateProjectSettingsRequest;
use App\Models\Role;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use App\Services\Webhooks\OutboundWebhookDispatcher;
use App\Support\Collections\ContentLocaleCatalog;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

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
    public function edit(): Response
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
        ]);
    }

    /**
     * Persist project settings.
     */
    public function update(UpdateProjectSettingsRequest $request): RedirectResponse
    {
        $this->settings->setMany(
            SettingsRepository::SCOPE_PROJECT,
            'project',
            $request->projectValues(),
        );

        $this->projectSettings->forgetPublicApiAllowedOriginsCache();

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

        $dispatcher->dispatchPing();

        return to_route('project.edit')
            ->with('success', __('Test webhook event queued.'));
    }
}

<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Settings\Concerns\LogsProjectSettingsUpdateTrait;
use App\Http\Requests\Settings\UpdateProjectApiSettingsRequest;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Public API project settings (CORS allowed origins).
 */
class ProjectApiSettingsController extends Controller
{
    use LogsProjectSettingsUpdateTrait;

    public function __construct(
        private readonly ProjectSettings $projectSettings,
        private readonly SettingsRepository $settings,
    ) {}

    /**
     * Render the API settings form.
     */
    public function edit(): Response
    {
        return Inertia::render('settings/project/api', [
            'project' => $this->projectSettings->forEditOnly([
                'public_api_allowed_origins',
            ]),
        ]);
    }

    /**
     * Persist API settings and clear the CORS origins cache.
     */
    public function update(UpdateProjectApiSettingsRequest $request): RedirectResponse
    {
        $values = $request->projectValues();

        $this->settings->setMany(
            SettingsRepository::SCOPE_PROJECT,
            'project',
            $values,
        );

        $this->projectSettings->forgetPublicApiAllowedOriginsCache();

        $this->logProjectSettingsUpdate($request, 'api', $values);

        return to_route('project.api.edit');
    }
}

<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Settings\Concerns\LogsProjectSettingsUpdateTrait;
use App\Http\Requests\Settings\UpdateProjectSettingsRequest;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * General project settings (identity + reporting links).
 */
class ProjectSettingsController extends Controller
{
    use LogsProjectSettingsUpdateTrait;

    public function __construct(
        private readonly ProjectSettings $projectSettings,
        private readonly SettingsRepository $settings,
    ) {}

    /**
     * Render the general project settings form.
     */
    public function edit(): Response
    {
        return Inertia::render('settings/project', [
            'project' => $this->projectSettings->forEditOnly([
                'name',
                'description',
                'url',
                'report_issue_url',
                'report_bug_url',
                'report_error_url',
            ]),
        ]);
    }

    /**
     * Persist general project settings.
     */
    public function update(UpdateProjectSettingsRequest $request): RedirectResponse
    {
        $values = $request->projectValues();

        $this->settings->setMany(
            SettingsRepository::SCOPE_PROJECT,
            'project',
            $values,
        );

        $this->logProjectSettingsUpdate($request, 'general', $values);

        return to_route('project.edit');
    }
}

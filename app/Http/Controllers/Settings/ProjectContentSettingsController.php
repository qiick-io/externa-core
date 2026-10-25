<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Settings\Concerns\LogsProjectSettingsUpdateTrait;
use App\Http\Requests\Settings\UpdateProjectContentSettingsRequest;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Content project settings (revision retention + live preview).
 */
class ProjectContentSettingsController extends Controller
{
    use LogsProjectSettingsUpdateTrait;

    public function __construct(
        private readonly ProjectSettings $projectSettings,
        private readonly SettingsRepository $settings,
    ) {}

    /**
     * Render the content settings form.
     */
    public function edit(): Response
    {
        return Inertia::render('settings/project/content', [
            'project' => $this->projectSettings->forEditOnly([
                'revision_retention_count',
                'revision_retention_days',
                'preview_url_default',
            ]),
        ]);
    }

    /**
     * Persist content settings.
     */
    public function update(UpdateProjectContentSettingsRequest $request): RedirectResponse
    {
        $values = $request->projectValues();

        $this->settings->setMany(
            SettingsRepository::SCOPE_PROJECT,
            'project',
            $values,
        );

        $this->logProjectSettingsUpdate($request, 'content', $values);

        return to_route('project.content.edit');
    }
}

<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Settings\Concerns\LogsProjectSettingsUpdateTrait;
use App\Http\Requests\Settings\UpdateProjectFilesSettingsRequest;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Files & media project settings (upload limits + image transforms).
 */
class ProjectFilesSettingsController extends Controller
{
    use LogsProjectSettingsUpdateTrait;

    public function __construct(
        private readonly ProjectSettings $projectSettings,
        private readonly SettingsRepository $settings,
    ) {}

    /**
     * Render the files & media settings form.
     */
    public function edit(): Response
    {
        return Inertia::render('settings/project/files', [
            'project' => $this->projectSettings->forEditOnly([
                'files_max_upload_bytes',
                'chat_max_upload_bytes',
                'allowed_transformations',
                'preset_transformations',
            ]),
            'transformationOptions' => config('settings.project.allowed_transformations', ['thumbnail']),
            'transformFits' => config('settings.project.transform_fits', ['contain']),
            'transformFormats' => config('settings.project.transform_formats', ['auto']),
        ]);
    }

    /**
     * Persist files & media settings.
     */
    public function update(UpdateProjectFilesSettingsRequest $request): RedirectResponse
    {
        $values = $request->projectValues();

        $this->settings->setMany(
            SettingsRepository::SCOPE_PROJECT,
            'project',
            $values,
        );

        $this->logProjectSettingsUpdate($request, 'files', $values);

        return to_route('project.files.edit');
    }
}

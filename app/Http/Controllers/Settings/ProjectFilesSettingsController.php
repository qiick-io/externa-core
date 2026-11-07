<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Settings\Concerns\LogsProjectSettingsUpdateTrait;
use App\Http\Requests\Settings\UpdateProjectFilesSettingsRequest;
use App\Services\Settings\ProjectSettingsService;
use App\Services\Settings\SettingsRepositoryService;
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
        private readonly ProjectSettingsService $projectSettings,
        private readonly SettingsRepositoryService $settings,
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
                'upload_allowed_mimes',
                'upload_allowed_extensions',
                'upload_allow_svg',
            ]),
            'transformationOptions' => config('settings.project.allowed_transformations', ['thumbnail']),
            'transformFits' => config('settings.project.transform_fits', ['contain']),
            'transformFormats' => config('settings.project.transform_formats', ['auto']),
            'defaultUploadMimes' => array_values((array) config('files.upload_allowed_mimes', [])),
        ]);
    }

    /**
     * Persist files & media settings.
     */
    public function update(UpdateProjectFilesSettingsRequest $request): RedirectResponse
    {
        $values = $request->projectValues();

        $this->settings->setMany(
            SettingsRepositoryService::SCOPE_PROJECT,
            'project',
            $values,
        );

        $this->logProjectSettingsUpdate($request, 'files', $values);

        return to_route('project.files.edit');
    }
}

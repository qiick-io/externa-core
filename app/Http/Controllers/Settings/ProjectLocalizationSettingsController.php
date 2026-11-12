<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Settings\Concerns\LogsProjectSettingsUpdateTrait;
use App\Http\Requests\Settings\UpdateProjectLocalizationSettingsRequest;
use App\Services\Collections\ContentLocaleCatalogService;
use App\Services\Settings\ProjectSettingsService;
use App\Services\Settings\SettingsRepositoryService;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Localization project settings (admin UI language + content locales).
 */
class ProjectLocalizationSettingsController extends Controller
{
    use LogsProjectSettingsUpdateTrait;

    public function __construct(
        private readonly ProjectSettingsService $projectSettings,
        private readonly SettingsRepositoryService $settings,
    ) {}

    /**
     * Render the localization settings form.
     */
    public function edit(): Response
    {
        return Inertia::render('settings/project/localization', [
            'project' => $this->projectSettings->forEditOnly([
                'default_language',
                'content_locales',
                'default_content_locale',
                'fallback_content_locales',
            ]),
            'availableLocales' => config('i18n.available_locales', ['en' => 'English']),
            'contentLocaleCatalog' => ContentLocaleCatalogService::all(),
        ]);
    }

    /**
     * Persist localization settings.
     */
    public function update(UpdateProjectLocalizationSettingsRequest $request): RedirectResponse
    {
        $values = $request->projectValues();

        $this->settings->setMany(
            SettingsRepositoryService::SCOPE_PROJECT,
            'project',
            $values,
        );

        $this->logProjectSettingsUpdate($request, 'localization', $values);

        return to_route('project.localization.edit');
    }
}

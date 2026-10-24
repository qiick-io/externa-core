<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Settings\Concerns\LogsProjectSettingsUpdateTrait;
use App\Http\Requests\Settings\UpdateAppearanceSidebarSettingsRequest;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Sidebar module order / visibility (next to Appearance branding).
 */
class AppearanceSidebarSettingsController extends Controller
{
    use LogsProjectSettingsUpdateTrait;

    public function __construct(
        private readonly ProjectSettings $projectSettings,
        private readonly SettingsRepository $settings,
    ) {}

    /**
     * Render the sidebar settings form.
     */
    public function edit(): Response
    {
        return Inertia::render('settings/appearance/sidebar', [
            'project' => $this->projectSettings->forEditOnly([
                'sidebar_modules',
            ]),
        ]);
    }

    /**
     * Persist sidebar module settings.
     */
    public function update(UpdateAppearanceSidebarSettingsRequest $request): RedirectResponse
    {
        $values = $request->projectValues();

        $this->settings->setMany(
            SettingsRepository::SCOPE_PROJECT,
            'project',
            $values,
        );

        $this->logProjectSettingsUpdate($request, 'sidebar', $values);

        return to_route('appearance.sidebar.edit');
    }
}

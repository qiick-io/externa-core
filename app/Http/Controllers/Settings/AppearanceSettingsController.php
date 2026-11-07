<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\UpdateAppearanceSettingsRequest;
use App\Services\Settings\ProjectAppearanceService;
use App\Services\Settings\SettingsRepositoryService;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Project branding and default theme settings.
 */
class AppearanceSettingsController extends Controller
{
    public function __construct(
        private readonly ProjectAppearanceService $projectAppearance,
        private readonly SettingsRepositoryService $settings,
    ) {}

    /**
     * Render the project appearance settings form.
     */
    public function edit(): Response
    {
        return Inertia::render('settings/appearance', [
            'appearance' => $this->projectAppearance->forEdit(),
        ]);
    }

    /**
     * Persist project appearance settings.
     */
    public function update(UpdateAppearanceSettingsRequest $request): RedirectResponse
    {
        $this->settings->setMany(
            SettingsRepositoryService::SCOPE_PROJECT,
            'appearance',
            $request->appearanceValues(),
        );

        return to_route('appearance.edit');
    }
}

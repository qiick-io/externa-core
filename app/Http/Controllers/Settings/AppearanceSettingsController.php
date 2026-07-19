<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\UpdateAppearanceSettingsRequest;
use App\Services\Settings\ProjectAppearance;
use App\Services\Settings\SettingsRepository;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Project branding and default theme settings.
 */
class AppearanceSettingsController extends Controller
{
    public function __construct(
        private readonly ProjectAppearance $projectAppearance,
        private readonly SettingsRepository $settings,
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
            SettingsRepository::SCOPE_PROJECT,
            'appearance',
            $request->appearanceValues(),
        );

        return to_route('appearance.edit');
    }
}

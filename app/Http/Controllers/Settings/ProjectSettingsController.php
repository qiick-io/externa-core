<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\UpdateProjectSettingsRequest;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;
use App\Models\Role;

/**
 * Project-level configuration (general, security, registration, files, reporting).
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

        return to_route('project.edit');
    }
}

<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Settings\Concerns\LogsProjectSettingsUpdateTrait;
use App\Http\Requests\Settings\UpdateProjectSecuritySettingsRequest;
use App\Models\Role;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Authentication & security project settings.
 */
class ProjectSecuritySettingsController extends Controller
{
    use LogsProjectSettingsUpdateTrait;

    public function __construct(
        private readonly ProjectSettings $projectSettings,
        private readonly SettingsRepository $settings,
    ) {}

    /**
     * Render the authentication & security settings form.
     */
    public function edit(): Response
    {
        $guard = config('auth.defaults.guard', 'web');

        return Inertia::render('settings/project/security', [
            'project' => $this->projectSettings->forEditOnly([
                'password_policy',
                'login_max_attempts',
                'registration_enabled',
                'default_user_role',
                'email_verification_required',
                'two_factor_required',
                'allowed_domains',
                'oidc_enabled',
                'oidc_issuer',
                'oidc_client_id',
                'oidc_client_secret_configured',
                'oidc_button_label',
                'oidc_jit_provisioning',
            ]),
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
            'passwordPolicies' => config('settings.project.password_policies', ['medium']),
        ]);
    }

    /**
     * Persist authentication & security settings.
     */
    public function update(UpdateProjectSecuritySettingsRequest $request): RedirectResponse
    {
        $values = $request->projectValues();

        $this->settings->setMany(
            SettingsRepository::SCOPE_PROJECT,
            'project',
            $values,
        );

        $this->logProjectSettingsUpdate(
            $request,
            'security',
            $values,
            ['oidc_client_secret'],
        );

        return to_route('project.security.edit');
    }
}

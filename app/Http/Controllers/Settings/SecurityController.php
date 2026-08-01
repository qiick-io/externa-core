<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\PasswordUpdateRequest;
use App\Http\Requests\Settings\TwoFactorAuthenticationRequest;
use App\Services\Settings\ProjectSettings;
use Illuminate\Http\RedirectResponse;
use Illuminate\Routing\Controllers\HasMiddleware;
use Illuminate\Routing\Controllers\Middleware;
use Inertia\Inertia;
use Inertia\Response;
use Laravel\Fortify\Features;

/**
 * Manages password and two-factor security settings for the authenticated user.
 */
class SecurityController extends Controller implements HasMiddleware
{
    public function __construct(
        private readonly ProjectSettings $projectSettings,
    ) {}

    /**
     * Register Fortify password-confirmation middleware when required for 2FA setup.
     *
     * @return list<Middleware>
     */
    public static function middleware(): array
    {
        return Features::canManageTwoFactorAuthentication()
            && Features::optionEnabled(Features::twoFactorAuthentication(), 'confirmPassword')
                ? [new Middleware('password.confirm', only: ['edit'])]
                : [];
    }

    /**
     * Render the security settings page with two-factor state when enabled.
     */
    public function edit(TwoFactorAuthenticationRequest $request): Response
    {
        $canManageTwoFactor = Features::canManageTwoFactorAuthentication();
        $twoFactorRequired = $this->projectSettings->twoFactorRequired();
        $twoFactorEnabled = false;

        $props = [
            'canManageTwoFactor' => $canManageTwoFactor,
            'twoFactorRequired' => $twoFactorRequired,
        ];

        if ($canManageTwoFactor) {
            // ponytail: do not call Fortify ensureStateIsValid() here.
            // It disables unfinished enrollment on any later security.edit in a
            // different Unix second (InteractsWithTwoFactorState), which races
            // Inertia redirects/prefetch and EnsureTwoFactorIsEnabled while the
            // QR modal still shows the old secret — OTP then never verifies.
            // Abandoned secrets stay usable via Enable (no-op) + QR endpoints.
            $twoFactorEnabled = $request->user()->hasEnabledTwoFactorAuthentication();
            $props['twoFactorEnabled'] = $twoFactorEnabled;
            $props['requiresConfirmation'] = Features::optionEnabled(Features::twoFactorAuthentication(), 'confirm');
        }

        // Banner: project requires 2FA and this user has not completed Fortify enrollment.
        $props['twoFactorEnforcedForUser'] = $canManageTwoFactor
            && $twoFactorRequired
            && ! $twoFactorEnabled;

        return Inertia::render('settings/security', $props);
    }

    /**
     * Update the authenticated user's password.
     */
    public function update(PasswordUpdateRequest $request): RedirectResponse
    {
        $request->user()->update([
            'password' => $request->password,
        ]);

        return back();
    }
}

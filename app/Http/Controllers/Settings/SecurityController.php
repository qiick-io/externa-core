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
 * Manages password, two-factor, and passkey security settings for the authenticated user.
 */
class SecurityController extends Controller implements HasMiddleware
{
    public function __construct(
        private readonly ProjectSettings $projectSettings,
    ) {}

    /**
     * Register Fortify password-confirmation middleware when required for 2FA or passkeys.
     *
     * @return list<Middleware>
     */
    public static function middleware(): array
    {
        $confirmForTwoFactor = Features::canManageTwoFactorAuthentication()
            && Features::optionEnabled(Features::twoFactorAuthentication(), 'confirmPassword');

        $confirmForPasskeys = Features::canManagePasskeys()
            && Features::optionEnabled(Features::passkeys(), 'confirmPassword');

        return ($confirmForTwoFactor || $confirmForPasskeys)
            ? [new Middleware('password.confirm', only: ['edit'])]
            : [];
    }

    /**
     * Render the security settings page with two-factor and passkey state when enabled.
     */
    public function edit(TwoFactorAuthenticationRequest $request): Response
    {
        $user = $request->user();
        $canManageTwoFactor = Features::canManageTwoFactorAuthentication();
        $canManagePasskeys = Features::canManagePasskeys();
        $twoFactorRequired = $this->projectSettings->twoFactorRequired();
        $twoFactorEnabled = false;
        $hasPasskeys = false;

        $props = [
            'canManageTwoFactor' => $canManageTwoFactor,
            'canManagePasskeys' => $canManagePasskeys,
            'twoFactorRequired' => $twoFactorRequired,
        ];

        if ($canManageTwoFactor) {
            // ponytail: do not call Fortify ensureStateIsValid() here.
            // It disables unfinished enrollment on any later security.edit in a
            // different Unix second (InteractsWithTwoFactorState), which races
            // Inertia redirects/prefetch and EnsureTwoFactorIsEnabled while the
            // QR modal still shows the old secret — OTP then never verifies.
            // Abandoned secrets stay usable via Enable (no-op) + QR endpoints.
            $twoFactorEnabled = $user->hasEnabledTwoFactorAuthentication();
            $props['twoFactorEnabled'] = $twoFactorEnabled;
            $props['requiresConfirmation'] = Features::optionEnabled(Features::twoFactorAuthentication(), 'confirm');
        }

        if ($canManagePasskeys) {
            $hasPasskeys = $user->hasPasskeysEnabled();
            $props['passkeys'] = $user->passkeys()
                ->latest()
                ->get(['id', 'name', 'created_at', 'last_used_at'])
                ->map(fn ($passkey) => [
                    'id' => $passkey->id,
                    'name' => $passkey->name,
                    'created_at' => $passkey->created_at?->toIso8601String(),
                    'last_used_at' => $passkey->last_used_at?->toIso8601String(),
                ])
                ->values()
                ->all();
        }

        // Banner: project requires MFA and this user has neither TOTP nor a passkey.
        $props['twoFactorEnforcedForUser'] = $canManageTwoFactor
            && $twoFactorRequired
            && ! $twoFactorEnabled
            && ! ($canManagePasskeys && $hasPasskeys);

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

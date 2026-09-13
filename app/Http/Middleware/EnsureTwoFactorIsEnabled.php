<?php

namespace App\Http\Middleware;

use App\Services\Settings\ProjectSettings;
use Closure;
use Illuminate\Http\Request;
use Laravel\Fortify\Features;
use Symfony\Component\HttpFoundation\Response;

/**
 * When project settings require 2FA, redirect users who have not completed Fortify setup.
 *
 * Satisfied by confirmed TOTP or at least one registered passkey.
 */
class EnsureTwoFactorIsEnabled
{
    /**
     * Routes needed to enroll (or leave) without a 2FA loop.
     *
     * @var list<string>
     */
    private const EXEMPT_ROUTE_NAMES = [
        'logout',
        'security.edit',
        'user-password.update',
        'profile.edit',
        'profile.update',
        'locale.update',
        'password.confirm',
        'password.confirmation',
        'password.confirm.store',
        'two-factor.enable',
        'two-factor.confirm',
        'two-factor.disable',
        'two-factor.qr-code',
        'two-factor.secret-key',
        'two-factor.recovery-codes',
        'two-factor.regenerate-recovery-codes',
        'passkey.registration-options',
        'passkey.store',
        'passkey.destroy',
    ];

    public function __construct(
        private readonly ProjectSettings $projectSettings,
    ) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // Exempt first so enrollment endpoints never depend on ProjectSettings.
        if ($user === null || $this->isExempt($request)) {
            return $next($request);
        }

        if (! $this->projectSettings->twoFactorRequired()
            || ! Features::canManageTwoFactorAuthentication()
            || $user->hasEnabledTwoFactorAuthentication()
            || (Features::canManagePasskeys() && $user->hasPasskeysEnabled())
        ) {
            return $next($request);
        }

        return redirect()->route('security.edit');
    }

    private function isExempt(Request $request): bool
    {
        $name = $request->route()?->getName();

        if ($name === null) {
            return false;
        }

        return in_array($name, self::EXEMPT_ROUTE_NAMES, true);
    }
}

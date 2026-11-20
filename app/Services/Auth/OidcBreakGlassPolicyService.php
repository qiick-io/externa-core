<?php

declare(strict_types=1);

namespace App\Services\Auth;

use App\Enums\RoleEnum;
use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use Qiick\Oidc\Contracts\BreakGlassPolicyContract;

/**
 * Who still signs in locally (password or passkey) in SSO-only mode, so an unreachable or
 * misconfigured IdP never locks the owner out: an active `super-admin` with a second factor
 * (a confirmed TOTP or a passkey, the same factors EnsureTwoFactorIsEnabledMiddleware accepts).
 * A password alone never gets past SSO-only mode.
 *
 * The password form of a break-glass sign-in is at `/login?local=1`. Outside SSO-only mode the
 * policy is not consulted: every active user keeps local login next to SSO.
 */
final readonly class OidcBreakGlassPolicyService implements BreakGlassPolicyContract
{
    public function isBreakGlassAccount(Authenticatable $user): bool
    {
        if (! $user instanceof User || ! $user->is_active || ! $user->hasRole(RoleEnum::SuperAdmin->value)) {
            return false;
        }

        return $user->hasEnabledTwoFactorAuthentication() || $user->hasPasskeysEnabled();
    }
}

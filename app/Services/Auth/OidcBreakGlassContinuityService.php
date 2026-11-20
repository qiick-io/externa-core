<?php

declare(strict_types=1);

namespace App\Services\Auth;

use App\Enums\RoleEnum;
use App\Models\Role;
use App\Models\User;
use Illuminate\Validation\ValidationException;
use Laravel\Passkeys\Passkey;
use Qiick\Oidc\Services\SsoOnlyModeService;

/**
 * Keeps at least one break-glass super-admin while SSO-only mode is active (#828).
 *
 * Disabling the last confirmed TOTP, deleting the last passkey that still qualifies,
 * removing the super-admin role, or deactivating/deleting that account would lock the
 * install out when the IdP is down. Refuses those changes with a validation error.
 */
final readonly class OidcBreakGlassContinuityService
{
    public function __construct(
        private SsoOnlyModeService $ssoOnlyMode,
        private OidcBreakGlassPolicyService $breakGlassPolicy,
    ) {}

    /**
     * @throws ValidationException when this would remove the last break-glass account
     */
    public function assertCanDisableTwoFactor(User $user): void
    {
        $this->assertSoleBreakGlassWouldStillQualify(
            $user,
            fn (User $candidate): bool => $candidate->hasPasskeysEnabled(),
        );
    }

    /**
     * @throws ValidationException when this would remove the last break-glass account
     */
    public function assertCanDestroyPasskey(User $user, Passkey $passkey): void
    {
        $remainingPasskeys = $user->passkeys()->whereKeyNot($passkey->getKey())->count();

        $this->assertSoleBreakGlassWouldStillQualify(
            $user,
            fn (User $candidate): bool => $candidate->hasEnabledTwoFactorAuthentication()
                || $remainingPasskeys > 0,
        );
    }

    /**
     * @param  list<int|string>  $roleIds  role ids after the sync (empty = no roles)
     *
     * @throws ValidationException when this would remove the last break-glass account
     */
    public function assertCanSyncRoles(User $user, array $roleIds): void
    {
        $keepsSuperAdmin = Role::query()
            ->where('name', RoleEnum::SuperAdmin->value)
            ->whereIn('id', $roleIds)
            ->exists();

        $this->assertSoleBreakGlassWouldStillQualify(
            $user,
            fn (User $candidate): bool => $keepsSuperAdmin
                && ($candidate->hasEnabledTwoFactorAuthentication() || $candidate->hasPasskeysEnabled()),
            'role_ids',
        );
    }

    /**
     * @throws ValidationException when this would remove the last break-glass account
     */
    public function assertCanDeactivateOrDelete(User $user): void
    {
        $this->assertSoleBreakGlassWouldStillQualify($user, fn (): bool => false, 'is_active');
    }

    /**
     * @param  callable(User): bool  $wouldStillQualify  whether `$user` would still be break-glass after the change
     *
     * @throws ValidationException
     */
    private function assertSoleBreakGlassWouldStillQualify(
        User $user,
        callable $wouldStillQualify,
        string $errorField = 'email',
    ): void {
        if (! $this->ssoOnlyMode->isActive() || ! $this->breakGlassPolicy->isBreakGlassAccount($user)) {
            return;
        }

        $hasOtherBreakGlass = User::query()
            ->where('is_active', true)
            ->whereKeyNot($user->getKey())
            ->role(RoleEnum::SuperAdmin->value)
            ->get()
            ->contains(fn (User $candidate): bool => $this->breakGlassPolicy->isBreakGlassAccount($candidate));

        if ($hasOtherBreakGlass || $wouldStillQualify($user)) {
            return;
        }

        throw ValidationException::withMessages([
            $errorField => __('SSO-only mode needs an active super-admin with confirmed two-factor authentication or a passkey.'),
        ]);
    }
}

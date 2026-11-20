<?php

declare(strict_types=1);

namespace App\Actions\Fortify;

use App\Models\User;
use App\Services\Auth\OidcBreakGlassContinuityService;
use Laravel\Fortify\Actions\DisableTwoFactorAuthentication;

/**
 * Fortify's disable-2FA action with the SSO-only break-glass continuity check (#828).
 */
final class DisableTwoFactorAuthenticationAction extends DisableTwoFactorAuthentication
{
    public function __construct(private OidcBreakGlassContinuityService $breakGlassContinuity) {}

    /**
     * {@inheritdoc}
     */
    public function __invoke($user): void
    {
        if ($user instanceof User) {
            $this->breakGlassContinuity->assertCanDisableTwoFactor($user);
        }

        parent::__invoke($user);
    }
}

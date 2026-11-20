<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\User;
use App\Services\Auth\OidcBreakGlassContinuityService;
use Illuminate\Contracts\Auth\Authenticatable;
use Laravel\Passkeys\Actions\DeletePasskey;
use Laravel\Passkeys\Passkey;

/**
 * Package delete-passkey action with the SSO-only break-glass continuity check (#828).
 */
final class DeletePasskeyAction extends DeletePasskey
{
    public function __construct(private OidcBreakGlassContinuityService $breakGlassContinuity) {}

    /**
     * {@inheritdoc}
     */
    public function __invoke(Authenticatable $user, Passkey $passkey): void
    {
        if ($user instanceof User) {
            $this->breakGlassContinuity->assertCanDestroyPasskey($user, $passkey);
        }

        parent::__invoke($user, $passkey);
    }
}

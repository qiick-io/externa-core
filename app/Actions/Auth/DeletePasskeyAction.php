<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\User;
use App\Services\Auth\OidcBreakGlassContinuityService;
use Illuminate\Contracts\Auth\Authenticatable;
use Laravel\Passkeys\Actions\DeletePasskey;
use Laravel\Passkeys\Passkey;

/**
 * Deletes a passkey after the SSO-only break-glass continuity check (#828).
 *
 * Bound into the container as {@see DeletePasskey} through a thin invokable adapter so the
 * package keeps calling `__invoke` while this action stays on the repo's `execute()` contract.
 */
final class DeletePasskeyAction
{
    public function __construct(private OidcBreakGlassContinuityService $breakGlassContinuity) {}

    /**
     * Refuse when this would remove the last break-glass factor, then delete the passkey.
     *
     * Side effects: may delete the passkey row and dispatch PasskeyDeleted.
     */
    public function execute(Authenticatable $user, Passkey $passkey): void
    {
        if ($user instanceof User) {
            $this->breakGlassContinuity->assertCanDestroyPasskey($user, $passkey);
        }

        (new DeletePasskey)($user, $passkey);
    }
}

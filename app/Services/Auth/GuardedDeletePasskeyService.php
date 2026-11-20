<?php

declare(strict_types=1);

namespace App\Services\Auth;

use App\Actions\Auth\DeletePasskeyAction;
use Illuminate\Contracts\Auth\Authenticatable;
use Laravel\Passkeys\Actions\DeletePasskey;
use Laravel\Passkeys\Passkey;

/**
 * Package {@see DeletePasskey} contract that forwards to {@see DeletePasskeyAction::execute()}.
 *
 * Lives outside `App\Actions` so the arch ratchet does not treat the package `__invoke` as an
 * Action entry point.
 */
final class GuardedDeletePasskeyService extends DeletePasskey
{
    public function __construct(private DeletePasskeyAction $deletePasskeyAction) {}

    /**
     * {@inheritdoc}
     */
    public function __invoke(Authenticatable $user, Passkey $passkey): void
    {
        $this->deletePasskeyAction->execute($user, $passkey);
    }
}

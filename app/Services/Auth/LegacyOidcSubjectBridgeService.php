<?php

declare(strict_types=1);

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Qiick\Oidc\Data\AuthenticatedIdentityData;
use Qiick\Oidc\Events\OidcIdentityLinkedEvent;
use Qiick\Oidc\Models\UserIdentity;

/**
 * One-release dual read of `users.oidc_sub` next to `user_identities` (#827).
 *
 * An identity row for (issuer, subject) always wins. When none exists yet, a user who still
 * only has the legacy `oidc_sub` column matching the subject is linked: an identity row is
 * created so the package's UserLinkingService finds them on this login and every later one.
 * The column is not dropped here; a later major removes it.
 *
 * ponytail: dual-read lives in the app for one release because UserLinkingService is final and
 * has no legacy hook; drop this bridge (and the column) when the next major ships.
 */
final readonly class LegacyOidcSubjectBridgeService
{
    /**
     * Promote a legacy `oidc_sub` into `user_identities` when no identity row exists yet.
     *
     * Side effects: may insert one `user_identities` row and dispatch OidcIdentityLinkedEvent.
     */
    public function promoteIfNeeded(AuthenticatedIdentityData $identity): void
    {
        $existingIdentity = UserIdentity::query()
            ->where('issuer', $identity->issuer)
            ->where('subject', $identity->subject)
            ->first();

        if ($existingIdentity !== null) {
            return;
        }

        $user = User::query()
            ->where('oidc_sub', $identity->subject)
            ->first();

        if ($user === null) {
            return;
        }

        $email = $identity->claim('email');
        $emailAtLink = is_string($email) && filter_var(trim($email), FILTER_VALIDATE_EMAIL) !== false
            ? mb_strtolower(trim($email))
            : null;

        $linkedIdentity = DB::transaction(fn (): UserIdentity => UserIdentity::query()->create([
            'user_id' => $user->id,
            'issuer' => $identity->issuer,
            'subject' => $identity->subject,
            'email_at_link' => $emailAtLink,
        ]));

        event(new OidcIdentityLinkedEvent($user, $identity));

        $linkedIdentity->setRelation('user', $user);
    }
}

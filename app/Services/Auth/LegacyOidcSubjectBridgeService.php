<?php

declare(strict_types=1);

namespace App\Services\Auth;

use App\Models\User;
use App\Services\Settings\Project\ProjectSecuritySettingsService;
use Illuminate\Database\UniqueConstraintViolationException;
use Qiick\Oidc\Data\AuthenticatedIdentityData;
use Qiick\Oidc\Events\OidcIdentityLinkedEvent;
use Qiick\Oidc\Models\UserIdentity;

/**
 * One-release dual read of `users.oidc_sub` next to `user_identities` (#827).
 *
 * An identity row for (issuer, subject) always wins. When none exists yet, a user who still
 * only has the legacy `oidc_sub` column matching the subject is linked: an identity row is
 * created so the package's UserLinkingService finds them on this login and every later one.
 * The column is not dropped here; the next release removes it.
 *
 * Matching is exact in PHP (`===`): MySQL/MariaDB's default collation would otherwise treat
 * `sub-case` and `Sub-Case` as the same `oidc_sub` and let an attacker take over the victim.
 * Bridging only runs when the token issuer equals the issuer saved in Settings (the string the
 * import used). Users who already have an identity for that issuer are left alone. A unique-index
 * race with a concurrent login is swallowed so the package login can find the row the winner wrote.
 *
 * ponytail: dual-read lives in the app for one release because UserLinkingService is final and
 * has no legacy hook; drop this bridge (and the column) in the next release.
 */
final readonly class LegacyOidcSubjectBridgeService
{
    public function __construct(
        private ProjectSecuritySettingsService $securitySettings,
    ) {}

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

        $configuredIssuer = $this->securitySettings->oidcIssuer();

        if ($configuredIssuer === null || $configuredIssuer !== $identity->issuer) {
            return;
        }

        $user = $this->userWithExactLegacySubject($identity->subject);

        if ($user === null) {
            return;
        }

        if (UserIdentity::query()
            ->where('user_id', $user->id)
            ->where('issuer', $identity->issuer)
            ->exists()) {
            return;
        }

        $email = $identity->claim('email');
        $emailAtLink = is_string($email) && filter_var(trim($email), FILTER_VALIDATE_EMAIL) !== false
            ? mb_strtolower(trim($email))
            : null;

        try {
            // No wrapping transaction: a concurrent login's insert must stay visible when this
            // create hits the unique index, so the package login can find the winner's row.
            $linkedIdentity = UserIdentity::query()->create([
                'user_id' => $user->id,
                'issuer' => $identity->issuer,
                'subject' => $identity->subject,
                'email_at_link' => $emailAtLink,
            ]);
        } catch (UniqueConstraintViolationException) {
            // Concurrent login already wrote this (issuer, subject); package login will find it.
            return;
        }

        event(new OidcIdentityLinkedEvent($user, $identity));

        $linkedIdentity->setRelation('user', $user);
    }

    /**
     * A user whose `oidc_sub` equals `$subject` byte-for-byte.
     *
     * The SQL `where` may be case-insensitive on MySQL/MariaDB; the PHP `===` is the real match.
     */
    private function userWithExactLegacySubject(string $subject): ?User
    {
        return User::query()
            ->whereNotNull('oidc_sub')
            ->where('oidc_sub', '!=', '')
            ->where('oidc_sub', $subject)
            ->get()
            ->first(fn (User $candidate): bool => $candidate->oidc_sub === $subject);
    }
}

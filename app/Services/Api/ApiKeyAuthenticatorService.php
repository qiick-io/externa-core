<?php

declare(strict_types=1);

namespace App\Services\Api;

use App\Actions\ApiKeys\RecordApiKeyUsageAction;
use App\Enums\ApiKeyScopeEnum;
use App\Enums\RoleEnum;
use App\Exceptions\ApiKeyRejectedException;
use App\Http\Middleware\AuthenticateMcpRequestMiddleware;
use App\Http\Middleware\ResolveApiAccessMiddleware;
use App\Models\ApiKey;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Mcp\McpAccessTokenAuthenticatorService;
use Illuminate\Http\Request;

/**
 * The one place a presented API key is checked, shared by the public API
 * ({@see ResolveApiAccessMiddleware}), the MCP endpoint
 * ({@see AuthenticateMcpRequestMiddleware}) and the public-origin gate, so
 * every surface refuses the same keys with the same answer ({@see ApiKeyRejectedException}).
 *
 * The checks after the lookup ({@see self::authorizeCredential()}) are also what an OAuth access
 * token's grant row goes through ({@see McpAccessTokenAuthenticatorService}, #802): both doors
 * judge the same row with the same code, so they cannot drift apart.
 *
 * Lookup is a single indexed equality on the public `key_prefix`, never a scan; the SHA-256 of
 * the full presented token is then compared with `hash_equals()` against `key_hash` and, inside
 * the rotation grace window, `previous_key_hash`. Nothing is cached: a revoked or rotated key is
 * judged on the row as it is now.
 */
final class ApiKeyAuthenticatorService
{
    public function __construct(
        private readonly RecordApiKeyUsageAction $recordApiKeyUsageAction,
        private readonly EffectivePermissionResolverService $permissionResolver,
    ) {}

    /**
     * The key the token belongs to, whatever its state, or null when no key matches.
     */
    public function findByToken(string $presentedToken): ?ApiKey
    {
        $keyPrefix = ApiKey::publicPrefixOf($presentedToken);

        if ($keyPrefix === null) {
            return null;
        }

        $presentedHash = ApiKey::hashSecret($presentedToken);
        $candidateApiKeys = ApiKey::query()
            ->issuedKeys()
            ->with(['role', 'owner'])
            ->where('key_prefix', $keyPrefix)
            ->get();

        foreach ($candidateApiKeys as $candidateApiKey) {
            if (hash_equals($candidateApiKey->key_hash, $presentedHash)) {
                return $candidateApiKey;
            }

            if ($candidateApiKey->isPreviousSecretValid()
                && hash_equals((string) $candidateApiKey->previous_key_hash, $presentedHash)) {
                return $candidateApiKey;
            }
        }

        return null;
    }

    /**
     * Authenticate the token for this request and record its use.
     *
     * Side effect: writes `last_used_at` / `last_used_ip` through {@see RecordApiKeyUsageAction}.
     *
     * @throws ApiKeyRejectedException `invalid_token` for an unknown, revoked or expired key, an
     *                                 inactive owner, a missing or super-admin role, or (when
     *                                 `$isOwnerRequired`) an ownerless key; `ip_not_allowed`
     *                                 outside the allowlist; `insufficient_scope` for a key
     *                                 holding no scope at all, or lacking `$requiredScope`
     */
    public function authenticate(
        Request $request,
        string $presentedToken,
        bool $isOwnerRequired = false,
        ?ApiKeyScopeEnum $requiredScope = null,
    ): ApiKey {
        $apiKey = $this->findByToken($presentedToken);

        if ($apiKey === null) {
            throw ApiKeyRejectedException::unknownKey();
        }

        $this->authorizeCredential($request, $apiKey, $isOwnerRequired, $requiredScope);

        return $apiKey;
    }

    /**
     * Whether the credential row may act on this request, and record its use: revocation,
     * expiry, owner, role, IP allowlist and scopes. Called for an API key once its token matched
     * and for an OAuth grant once its access token was verified, so a rule holds at both doors.
     *
     * Side effect: writes `last_used_at` / `last_used_ip` through {@see RecordApiKeyUsageAction}.
     *
     * @throws ApiKeyRejectedException as {@see self::authenticate()}, worded for an access token
     *                                 when the row is an OAuth grant
     */
    public function authorizeCredential(
        Request $request,
        ApiKey $apiKey,
        bool $isOwnerRequired = false,
        ?ApiKeyScopeEnum $requiredScope = null,
    ): void {
        $isOAuthGrant = $apiKey->isOAuthGrant();

        if ($apiKey->isRevoked()) {
            throw ApiKeyRejectedException::revokedKey($isOAuthGrant);
        }

        if ($apiKey->isExpired()) {
            throw ApiKeyRejectedException::expiredKey($isOAuthGrant);
        }

        $this->assertOwnerCanAct($apiKey, $isOwnerRequired);
        $this->assertRoleCanAct($apiKey);
        $this->assertOwnerStillHoldsGrant($apiKey);

        if (! $apiKey->allowsIp((string) $request->ip())) {
            throw ApiKeyRejectedException::ipNotAllowed();
        }

        if ($apiKey->grantedScopes() === []) {
            throw ApiKeyRejectedException::noScopes($isOAuthGrant);
        }

        if ($requiredScope !== null && ! $apiKey->hasScope($requiredScope)) {
            throw ApiKeyRejectedException::insufficientScope($requiredScope, $isOAuthGrant);
        }

        $this->recordApiKeyUsageAction->execute($apiKey, $request->ip());
    }

    /**
     * An owned key acts as its owner, so a deactivated or deleted owner stops it (#215).
     */
    private function assertOwnerCanAct(ApiKey $apiKey, bool $isOwnerRequired): void
    {
        if ($apiKey->owner_id === null) {
            if ($isOwnerRequired) {
                throw ApiKeyRejectedException::unusableKey(__('MCP requires an API key with an owner.'));
            }

            return;
        }

        $owner = $apiKey->owner;

        if (! $owner instanceof User || ! $owner->is_active || $owner->trashed()) {
            throw ApiKeyRejectedException::unusableKey($apiKey->isOAuthGrant()
                ? __('The account that authorized this access token is no longer active.')
                : __('The API key owner is no longer active.'));
        }
    }

    private function assertRoleCanAct(ApiKey $apiKey): void
    {
        $role = $apiKey->role;

        if ($role === null) {
            throw ApiKeyRejectedException::unusableKey($apiKey->isOAuthGrant()
                ? __('The role granted to this access token is missing.')
                : __('API key role is missing.'));
        }

        if ($role->name === RoleEnum::SuperAdmin->value) {
            throw ApiKeyRejectedException::unusableKey(__('API keys cannot use the super-admin role.'));
        }
    }

    /**
     * Re-check at use time for OAuth grants only: the owner may still give every scope on the
     * row, and they still hold the role they approved (an instance super-admin may keep any
     * non-super-admin role they granted). Plain API keys keep the 1.5 owner ceiling (ACL
     * intersection) without a second canGrantScope pass — that would break released 1.x keys
     * whose owner lacks AI access.
     *
     * The permission resolver is forgotten for this owner first so a demotion in another
     * request (or earlier in the same long-lived worker) is never masked by an in-memory cache.
     */
    private function assertOwnerStillHoldsGrant(ApiKey $apiKey): void
    {
        if (! $apiKey->isOAuthGrant()) {
            return;
        }

        $owner = $apiKey->owner;

        if (! $owner instanceof User) {
            return;
        }

        $this->permissionResolver->forget($owner);
        $owner->unsetRelation('roles');
        $owner->unsetRelation('permissions');
        $owner->unsetRelation('groups');

        $role = $apiKey->role;

        if ($role !== null && ! $this->ownerMayStillActAsRole($owner, $role->name, (int) $role->id)) {
            throw ApiKeyRejectedException::unusableKey(
                __('The account that authorized this access token no longer holds the granted role.'),
            );
        }

        foreach ($apiKey->grantedScopes() as $scope) {
            if (! $this->permissionResolver->canGrantScope($owner, $scope)) {
                throw ApiKeyRejectedException::unusableKey(
                    __('The account that authorized this access token can no longer grant its scopes.'),
                );
            }
        }
    }

    /**
     * Whether the grant owner may still act as `$roleName`: they hold it, or they are an
     * instance super-admin granting any role except super-admin (same rule as consent).
     */
    private function ownerMayStillActAsRole(User $owner, string $roleName, int $roleId): bool
    {
        if (in_array($roleId, $this->permissionResolver->effectiveRoleIds($owner), true)) {
            return true;
        }

        return $this->permissionResolver->isSuperAdmin($owner)
            && $roleName !== RoleEnum::SuperAdmin->value;
    }
}

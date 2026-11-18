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
use Illuminate\Http\Request;

/**
 * The one place a presented API key is checked, shared by the public API
 * ({@see ResolveApiAccessMiddleware}), the MCP endpoint
 * ({@see AuthenticateMcpRequestMiddleware}) and the public-origin gate, so
 * every surface refuses the same keys with the same answer ({@see ApiKeyRejectedException}).
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
        $candidateApiKeys = ApiKey::query()->with(['role', 'owner'])->where('key_prefix', $keyPrefix)->get();

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

        if ($apiKey->isRevoked()) {
            throw ApiKeyRejectedException::revokedKey();
        }

        if ($apiKey->isExpired()) {
            throw ApiKeyRejectedException::expiredKey();
        }

        $this->assertOwnerCanAct($apiKey, $isOwnerRequired);
        $this->assertRoleCanAct($apiKey);

        if (! $apiKey->allowsIp((string) $request->ip())) {
            throw ApiKeyRejectedException::ipNotAllowed();
        }

        if ($apiKey->grantedScopes() === []) {
            throw ApiKeyRejectedException::noScopes();
        }

        if ($requiredScope !== null && ! $apiKey->hasScope($requiredScope)) {
            throw ApiKeyRejectedException::insufficientScope($requiredScope);
        }

        $this->recordApiKeyUsageAction->execute($apiKey, $request->ip());

        return $apiKey;
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
            throw ApiKeyRejectedException::unusableKey(__('The API key owner is no longer active.'));
        }
    }

    private function assertRoleCanAct(ApiKey $apiKey): void
    {
        $role = $apiKey->role;

        if ($role === null) {
            throw ApiKeyRejectedException::unusableKey(__('API key role is missing.'));
        }

        if ($role->name === RoleEnum::SuperAdmin->value) {
            throw ApiKeyRejectedException::unusableKey(__('API keys cannot use the super-admin role.'));
        }
    }
}

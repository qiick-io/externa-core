<?php

declare(strict_types=1);

namespace App\Services\Mcp;

use App\Enums\ApiKeyScopeEnum;
use App\Models\ApiKey;
use App\Models\User;

/**
 * The remote MCP clients a user has authorized and not revoked (#802), as Settings → Connected
 * apps lists them: what each may do, with which role and collections, and when it last acted.
 */
final class ConnectedMcpClientService
{
    /**
     * @return list<array{id: int, name: string, redirectHosts: list<string>, scopes: list<string>, role: string|null, collectionSlugs: list<string>|null, authorizedAt: string|null, lastUsedAt: string|null}>
     */
    public function activeGrantsFor(User $user): array
    {
        $grants = ApiKey::query()
            ->whereNotNull('oauth_client_id')
            ->where('owner_id', $user->id)
            ->whereNull('revoked_at')
            ->with(['role:id,name', 'oauthClient'])
            ->latest('id')
            ->get();

        return array_values($grants->map(fn (ApiKey $grant): array => [
            'id' => (int) $grant->id,
            'name' => $grant->name,
            'redirectHosts' => $this->redirectHosts($grant),
            'scopes' => array_map(static fn (ApiKeyScopeEnum $scope): string => $scope->value, $grant->grantedScopes()),
            'role' => $grant->role?->name,
            'collectionSlugs' => $grant->collection_slugs,
            'authorizedAt' => $grant->created_at?->toIso8601String(),
            'lastUsedAt' => $grant->last_used_at?->toIso8601String(),
        ])->all());
    }

    /**
     * The hosts (or private-use schemes) the client registered to return to: what identifies
     * it beyond the name it chose for itself.
     *
     * @return list<string>
     */
    private function redirectHosts(ApiKey $grant): array
    {
        $redirectUris = $grant->oauthClient?->getAttribute('redirect_uris');
        $redirectHosts = [];

        foreach (is_array($redirectUris) ? $redirectUris : [] as $redirectUri) {
            $redirectHost = is_string($redirectUri)
                ? (parse_url($redirectUri, PHP_URL_HOST) ?: parse_url($redirectUri, PHP_URL_SCHEME))
                : null;

            if (is_string($redirectHost) && $redirectHost !== '' && ! in_array($redirectHost, $redirectHosts, true)) {
                $redirectHosts[] = $redirectHost;
            }
        }

        return $redirectHosts;
    }
}

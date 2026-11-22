<?php

declare(strict_types=1);

namespace App\Services\Mcp;

use App\Models\ApiKey;
use App\Models\OAuthBlockedRedirectHost;
use Laravel\Passport\Client;

/**
 * Admin reads for MCP OAuth clients and blocked redirect hosts (#815).
 */
final class McpOAuthClientAdminService
{
    public function __construct(
        private readonly McpOAuthRedirectUriService $redirectUriService,
    ) {}

    /**
     * Every registered client, newest first, with whether it ever received a grant.
     *
     * @return list<array{id: string, name: string, redirect_hosts: list<string>, is_revoked: bool, has_authorization: bool, created_at: string|null}>
     */
    public function clients(): array
    {
        $authorizedClientIds = ApiKey::query()
            ->whereNotNull('oauth_client_id')
            ->distinct()
            ->pluck('oauth_client_id')
            ->all();

        $redirectUriService = $this->redirectUriService;

        return array_values(Client::query()
            ->orderByDesc('created_at')
            ->get()
            ->map(static function (Client $client) use ($authorizedClientIds, $redirectUriService): array {
                $redirectUris = $client->getAttribute('redirect_uris');
                $redirectUris = is_array($redirectUris) ? $redirectUris : [];

                return [
                    'id' => (string) $client->getKey(),
                    'name' => (string) $client->name,
                    'redirect_hosts' => array_values(array_unique(array_filter(array_map(
                        static function (mixed $uri) use ($redirectUriService): ?string {
                            if (! is_string($uri)) {
                                return null;
                            }

                            $host = $redirectUriService->rawHostOf($uri);

                            return is_string($host) && $host !== '' ? strtolower($host) : null;
                        },
                        $redirectUris,
                    )))),
                    'is_revoked' => (bool) $client->revoked,
                    'has_authorization' => in_array($client->getKey(), $authorizedClientIds, true),
                    'created_at' => $client->created_at?->toIso8601String(),
                ];
            })
            ->all());
    }

    /**
     * @return list<array{id: int, host: string, created_at: string|null}>
     */
    public function blockedHosts(): array
    {
        return array_values(OAuthBlockedRedirectHost::query()
            ->orderBy('host')
            ->get()
            ->map(static fn (OAuthBlockedRedirectHost $blockedHost): array => [
                'id' => (int) $blockedHost->id,
                'host' => $blockedHost->host,
                'created_at' => $blockedHost->created_at?->toIso8601String(),
            ])
            ->all());
    }
}

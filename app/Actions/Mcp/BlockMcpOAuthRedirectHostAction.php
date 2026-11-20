<?php

declare(strict_types=1);

namespace App\Actions\Mcp;

use App\Models\OAuthBlockedRedirectHost;
use App\Models\User;
use App\Services\Mcp\McpOAuthRedirectUriService;
use Illuminate\Support\Facades\DB;
use Laravel\Passport\Client;

/**
 * Block a redirect host from MCP OAuth (#815): store the host, revoke every client whose
 * redirect URIs resolve to it (or a subdomain), and write an audit entry.
 */
final class BlockMcpOAuthRedirectHostAction
{
    public function __construct(
        private readonly McpOAuthRedirectUriService $redirectUriService,
        private readonly BlockMcpOAuthClientAction $blockMcpOAuthClientAction,
    ) {}

    public function execute(string $host, User $actor): OAuthBlockedRedirectHost
    {
        $normalizedHost = $this->redirectUriService->normalizeHost($host);

        return DB::transaction(function () use ($normalizedHost, $actor): OAuthBlockedRedirectHost {
            $blockedHost = OAuthBlockedRedirectHost::query()->firstOrCreate(
                ['host' => $normalizedHost],
                ['created_by' => $actor->id],
            );

            Client::query()
                ->where('revoked', false)
                ->orderBy('id')
                ->each(function (Client $client) use ($actor): void {
                    if ($this->redirectUriService->clientHasBlockedRedirectHost($client)) {
                        $this->blockMcpOAuthClientAction->execute($client, $actor);
                    }
                });

            activity('api-keys')
                ->causedBy($actor)
                ->performedOn($blockedHost)
                ->event('oauth_redirect_host_blocked')
                ->withProperties(['host' => $normalizedHost])
                ->log('MCP OAuth redirect host blocked');

            return $blockedHost;
        });
    }
}

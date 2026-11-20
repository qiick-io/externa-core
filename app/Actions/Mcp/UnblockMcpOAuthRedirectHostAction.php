<?php

declare(strict_types=1);

namespace App\Actions\Mcp;

use App\Models\OAuthBlockedRedirectHost;
use App\Models\User;

/**
 * Remove a blocked MCP OAuth redirect host and record the audit entry (#815).
 */
final class UnblockMcpOAuthRedirectHostAction
{
    public function execute(OAuthBlockedRedirectHost $blockedHost, User $actor): void
    {
        $host = $blockedHost->host;

        $blockedHost->delete();

        activity('api-keys')
            ->causedBy($actor)
            ->event('oauth_redirect_host_unblocked')
            ->withProperties(['host' => $host])
            ->log('MCP OAuth redirect host unblocked');
    }
}

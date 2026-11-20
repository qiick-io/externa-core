<?php

declare(strict_types=1);

namespace App\Actions\Mcp;

use App\Models\OAuthBlockedRedirectHost;
use App\Models\User;
use Illuminate\Support\Str;

/**
 * Block a redirect host from MCP OAuth dynamic client registration (#815).
 */
final class BlockMcpOAuthRedirectHostAction
{
    public function execute(string $host, User $actor): OAuthBlockedRedirectHost
    {
        $normalizedHost = Str::lower(trim($host));

        return OAuthBlockedRedirectHost::query()->firstOrCreate(
            ['host' => $normalizedHost],
            ['created_by' => $actor->id],
        );
    }
}

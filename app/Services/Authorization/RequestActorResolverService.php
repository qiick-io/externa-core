<?php

declare(strict_types=1);

namespace App\Services\Authorization;

use App\Support\Api\ApiAccess;

/**
 * Resolves the API actor (public or API key) of the current request for policies.
 *
 * Public API, GraphQL and MCP requests carry an {@see ApiAccess} in the request
 * attributes (set by ResolveApiAccessMiddleware / AuthenticateMcpRequestMiddleware).
 * Web sessions, AI tool runs and queued jobs have none.
 */
final class RequestActorResolverService
{
    public function apiAccess(): ?ApiAccess
    {
        if (! app()->bound('request')) {
            return null;
        }

        $access = request()->attributes->get('apiAccess');

        return $access instanceof ApiAccess ? $access : null;
    }

    public function hasApiAccess(): bool
    {
        return $this->apiAccess() !== null;
    }
}

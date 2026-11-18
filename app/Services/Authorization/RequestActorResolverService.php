<?php

declare(strict_types=1);

namespace App\Services\Authorization;

use App\Data\Api\ApiAccessData;

/**
 * Resolves the API actor (public or API key) of the current request for policies.
 *
 * Public API, GraphQL and MCP requests carry an {@see ApiAccessData} in the request
 * attributes (set by ResolveApiAccessMiddleware / AuthenticateMcpRequestMiddleware).
 * Web sessions, AI tool runs and queued jobs have none.
 */
final class RequestActorResolverService
{
    public function apiAccess(): ?ApiAccessData
    {
        if (! app()->bound('request')) {
            return null;
        }

        $access = request()->attributes->get('apiAccess');

        return $access instanceof ApiAccessData ? $access : null;
    }

    public function hasApiAccess(): bool
    {
        return $this->apiAccess() !== null;
    }
}

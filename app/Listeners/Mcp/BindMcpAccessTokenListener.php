<?php

declare(strict_types=1);

namespace App\Listeners\Mcp;

use App\Actions\Mcp\BindMcpAccessTokenAction;
use Laravel\Passport\Events\AccessTokenCreated;

/**
 * Binds every access token Passport issues to its grant and audience ({@see BindMcpAccessTokenAction}).
 * Synchronous on purpose: the token must be bound before the token response reaches the client.
 */
final class BindMcpAccessTokenListener
{
    public function __construct(
        private readonly BindMcpAccessTokenAction $bindMcpAccessTokenAction,
    ) {}

    public function handle(AccessTokenCreated $event): void
    {
        $this->bindMcpAccessTokenAction->execute($event->tokenId, $event->userId, $event->clientId);
    }
}

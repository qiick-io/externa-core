<?php

declare(strict_types=1);

/**
 * Optional first-party MCP streamable HTTP endpoint (#121).
 *
 * Disabled by default (`AI_MCP_ENABLED`). Auth: owned API key with mcp:read
 * (Bearer) or session user. OAuth/Passport is not wired in this MVP.
 */

use App\Http\Middleware\AuthenticateMcpRequestMiddleware;
use App\Http\Middleware\EnsureMcpEnabledMiddleware;
use App\Mcp\Servers\ExternaServer;
use Laravel\Mcp\Facades\Mcp;

Mcp::web('/mcp', ExternaServer::class)
    ->middleware([
        EnsureMcpEnabledMiddleware::class,
        // Auth before throttle so the mcp limiter can key by API key / user.
        AuthenticateMcpRequestMiddleware::class,
        'throttle:mcp',
    ])
    ->name('mcp');

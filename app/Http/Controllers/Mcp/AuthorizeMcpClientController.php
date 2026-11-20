<?php

declare(strict_types=1);

namespace App\Http\Controllers\Mcp;

use Illuminate\Contracts\Auth\Authenticatable;
use Laravel\Passport\Client;
use Laravel\Passport\Http\Controllers\AuthorizationController;
use Laravel\Passport\Scope;

/**
 * The OAuth authorization endpoint for remote MCP clients (#802): Passport's, which validates
 * the request (client, redirect URI, PKCE), sends a guest to the login page and renders the
 * consent screen ({@see McpOAuthServiceProvider} binds it to the Inertia page).
 *
 * One change: the user is always asked. Passport would approve silently when an earlier token
 * already covers the requested scopes, but a consent here narrows (role, scopes, collections),
 * and only the consent screen can ask for that again.
 */
class AuthorizeMcpClientController extends AuthorizationController
{
    /**
     * @param  Scope[]  $scopes
     */
    protected function hasGrantedScopes(Authenticatable $user, Client $client, array $scopes): bool
    {
        return false;
    }
}

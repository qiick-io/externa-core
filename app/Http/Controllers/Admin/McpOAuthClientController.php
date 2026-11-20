<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\Mcp\BlockMcpOAuthClientAction;
use App\Actions\Mcp\BlockMcpOAuthRedirectHostAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BlockMcpOAuthRedirectHostRequest;
use App\Models\OAuthBlockedRedirectHost;
use App\Models\User;
use App\Services\Mcp\McpOAuthClientAdminService;
use App\Services\Mcp\McpOAuthServerService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Laravel\Passport\Client;

/**
 * Admin list of MCP OAuth clients and blocked redirect hosts (#815).
 */
class McpOAuthClientController extends Controller
{
    public function index(
        McpOAuthServerService $oauthServer,
        McpOAuthClientAdminService $adminService,
    ): Response {
        abort_unless($oauthServer->isEnabled(), 404);

        return Inertia::render('admin/mcp-oauth-clients/index', [
            'clients' => $adminService->clients(),
            'blockedHosts' => $adminService->blockedHosts(),
            'hasPassportKeys' => $oauthServer->hasPassportKeys(),
        ]);
    }

    public function blockClient(
        Request $request,
        Client $client,
        BlockMcpOAuthClientAction $blockMcpOAuthClientAction,
    ): RedirectResponse {
        /** @var User $user */
        $user = $request->user();
        $blockMcpOAuthClientAction->execute($client, $user);

        return back();
    }

    public function blockHost(
        BlockMcpOAuthRedirectHostRequest $request,
        BlockMcpOAuthRedirectHostAction $blockMcpOAuthRedirectHostAction,
    ): RedirectResponse {
        /** @var User $user */
        $user = $request->user();
        $blockMcpOAuthRedirectHostAction->execute($request->string('host')->toString(), $user);

        return back();
    }

    public function unblockHost(OAuthBlockedRedirectHost $blockedHost): RedirectResponse
    {
        $blockedHost->delete();

        return back();
    }
}

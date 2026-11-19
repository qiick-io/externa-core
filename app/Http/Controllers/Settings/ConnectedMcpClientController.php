<?php

declare(strict_types=1);

namespace App\Http\Controllers\Settings;

use App\Actions\Mcp\RevokeMcpClientAccessAction;
use App\Http\Controllers\Controller;
use App\Models\ApiKey;
use App\Models\User;
use App\Services\Mcp\ConnectedMcpClientService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Settings → Connected apps (#802): the remote MCP clients the signed-in user authorized, and
 * revoking one. Beside the API keys in the settings, because that is where someone looks.
 */
class ConnectedMcpClientController extends Controller
{
    public function index(Request $request, ConnectedMcpClientService $connectedClients): Response
    {
        /** @var User $user */
        $user = $request->user();

        return Inertia::render('settings/connected-apps', [
            'connectedApps' => $connectedClients->activeGrantsFor($user),
        ]);
    }

    public function destroy(Request $request, ApiKey $apiKey, RevokeMcpClientAccessAction $revokeMcpClientAccessAction): RedirectResponse
    {
        Gate::authorize('revokeGrant', $apiKey);

        /** @var User $user */
        $user = $request->user();
        $revokeMcpClientAccessAction->execute($apiKey, $user);

        return redirect()
            ->route('connected-apps.index')
            ->with('success', __(':name can no longer use this workspace.', ['name' => $apiKey->name]));
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Controllers\Mcp;

use App\Actions\Mcp\GrantMcpClientAccessAction;
use App\Data\Mcp\McpClientGrantData;
use App\Http\Controllers\Controller;
use App\Http\Requests\Mcp\ApproveMcpClientRequest;
use App\Models\User;
use App\Services\Mcp\McpOAuthServerService;
use App\Traits\RedirectsToMcpClientTrait;
use Laravel\Passport\Bridge\Scope;
use Laravel\Passport\ClientRepository;
use Laravel\Passport\Http\Controllers\ConvertsPsrResponses;
use Laravel\Passport\Http\Controllers\HandlesOAuthErrors;
use Laravel\Passport\Http\Controllers\RetrievesAuthRequestFromSession;
use League\OAuth2\Server\AuthorizationServer;
use Psr\Http\Message\ResponseInterface;
use Symfony\Component\HttpFoundation\Response;

/**
 * The user approved a remote MCP client on the consent screen (#802 / #815): record the grant with
 * the role, API-key scopes and collections they chose ({@see GrantMcpClientAccessAction}), keep
 * the authorization code's wire scope as laravel/mcp's `mcp:use`, and send the code back.
 *
 * The grant row carries the narrowing; the Passport token only carries `mcp:use` so discovery,
 * registration and the token response stay on laravel/mcp's wire contract.
 */
class ApproveMcpClientController extends Controller
{
    use ConvertsPsrResponses;
    use HandlesOAuthErrors;
    use RedirectsToMcpClientTrait;
    use RetrievesAuthRequestFromSession;

    public function __construct(
        private readonly AuthorizationServer $server,
        private readonly ClientRepository $clients,
    ) {}

    public function __invoke(
        ApproveMcpClientRequest $request,
        GrantMcpClientAccessAction $grantMcpClientAccessAction,
        ResponseInterface $psrResponse,
    ): Response {
        $authorizationRequest = $this->getAuthRequestFromSession($request);
        $client = $this->clients->findActive($authorizationRequest->getClient()->getIdentifier());

        abort_if($client === null, 403);

        /** @var User $user checked by the request */
        $user = $request->user();
        $grantData = new McpClientGrantData(
            user: $user,
            client: $client,
            redirectUri: $authorizationRequest->getRedirectUri() ?? (string) ($client->redirect_uris[0] ?? ''),
            roleId: $request->integer('role_id'),
            scopes: $request->approvedScopes(),
            collectionSlugs: $request->approvedCollectionSlugs(),
        );

        $grantMcpClientAccessAction->execute($grantData);

        $authorizationRequest->setScopes([new Scope(McpOAuthServerService::WIRE_SCOPE)]);
        $authorizationRequest->setAuthorizationApproved(true);

        return $this->redirectToClient($request, fn (): Response => $this->withErrorHandling(fn (): Response => $this->convertResponse(
            $this->server->completeAuthorizationRequest($authorizationRequest, $psrResponse),
        )));
    }
}

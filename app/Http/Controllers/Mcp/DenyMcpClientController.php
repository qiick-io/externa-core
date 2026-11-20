<?php

declare(strict_types=1);

namespace App\Http\Controllers\Mcp;

use App\Http\Controllers\Controller;
use App\Traits\RedirectsToMcpClientTrait;
use Illuminate\Http\Request;
use Laravel\Passport\Http\Controllers\ConvertsPsrResponses;
use Laravel\Passport\Http\Controllers\HandlesOAuthErrors;
use Laravel\Passport\Http\Controllers\RetrievesAuthRequestFromSession;
use League\OAuth2\Server\AuthorizationServer;
use Psr\Http\Message\ResponseInterface;
use Symfony\Component\HttpFoundation\Response;

/**
 * The user denied a remote MCP client on the consent screen (#802): nothing is recorded and the
 * client gets `access_denied` (RFC 6749 §4.1.2.1), as with Passport's own deny step.
 */
class DenyMcpClientController extends Controller
{
    use ConvertsPsrResponses;
    use HandlesOAuthErrors;
    use RedirectsToMcpClientTrait;
    use RetrievesAuthRequestFromSession;

    public function __construct(
        private readonly AuthorizationServer $server,
    ) {}

    public function __invoke(Request $request, ResponseInterface $psrResponse): Response
    {
        $authorizationRequest = $this->getAuthRequestFromSession($request);
        $authorizationRequest->setAuthorizationApproved(false);

        return $this->redirectToClient($request, fn (): Response => $this->withErrorHandling(fn (): Response => $this->convertResponse(
            $this->server->completeAuthorizationRequest($authorizationRequest, $psrResponse),
        )));
    }
}

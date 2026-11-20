<?php

declare(strict_types=1);

namespace App\Traits;

use Closure;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

/**
 * Completing an authorization request answers with a redirect to the client, another origin:
 * the code on approval, an OAuth error such as `access_denied` (thrown by Passport as an
 * {@see HttpResponseException}) otherwise. The consent form is an Inertia form, so that redirect
 * must leave the Inertia visit as a full-page location change rather than an XHR redirect.
 */
trait RedirectsToMcpClientTrait
{
    /**
     * @param  Closure(): Response  $completeAuthorizationRequest
     */
    protected function redirectToClient(Request $request, Closure $completeAuthorizationRequest): Response
    {
        try {
            $clientRedirect = $completeAuthorizationRequest();
        } catch (HttpResponseException $exception) {
            $clientRedirect = $exception->getResponse();
        }

        $location = $clientRedirect->headers->get('Location');

        if ($request->header('X-Inertia') === null || ! $clientRedirect->isRedirection() || $location === null) {
            return $clientRedirect;
        }

        return Inertia::location($location);
    }
}

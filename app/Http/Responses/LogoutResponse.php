<?php

declare(strict_types=1);

namespace App\Http\Responses;

use App\Providers\FortifyServiceProvider;
use Illuminate\Http\JsonResponse;
use Laravel\Fortify\Contracts\LogoutResponse as LogoutResponseContract;
use Laravel\Fortify\Fortify;
use Symfony\Component\HttpFoundation\Response;

/**
 * Fortify logout response that finishes an SSO session at the IdP when one is pending.
 *
 * {@see FortifyServiceProvider} stores the RP-initiated logout URL on the request
 * before the session is invalidated; without that attribute this is the stock Fortify redirect.
 */
final class LogoutResponse implements LogoutResponseContract
{
    public const string END_SESSION_ATTRIBUTE = 'oidc.end_session_url';

    /**
     * {@inheritdoc}
     */
    public function toResponse($request): Response
    {
        if ($request->wantsJson()) {
            return new JsonResponse('', 204);
        }

        $endSessionUrl = $request->attributes->get(self::END_SESSION_ATTRIBUTE);

        if (is_string($endSessionUrl) && $endSessionUrl !== '') {
            return redirect()->away($endSessionUrl);
        }

        return redirect(Fortify::redirects('logout', '/'));
    }
}

<?php

namespace App\Http\Responses;

use App\Support\Auth\HomePath;
use Illuminate\Http\JsonResponse;
use Laravel\Passkeys\Contracts\PasskeyLoginResponse as PasskeyLoginResponseContract;
use Symfony\Component\HttpFoundation\Response;

/**
 * Send passkey logins to the same permission-aware home as password login.
 */
class PasskeyLoginResponse implements PasskeyLoginResponseContract
{
    /**
     * {@inheritdoc}
     */
    public function toResponse($request): Response
    {
        $home = HomePath::for($request->user());

        return $request->wantsJson()
            ? new JsonResponse(['redirect' => redirect()->intended($home)->getTargetUrl()], 200)
            : redirect()->intended($home);
    }
}

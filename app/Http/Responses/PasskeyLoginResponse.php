<?php

namespace App\Http\Responses;

use App\Services\Auth\HomePathService;
use Illuminate\Http\JsonResponse;
use Inertia\Inertia;
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
        $target = HomePathService::afterLogin($request);

        return $request->wantsJson()
            ? new JsonResponse(['redirect' => url($target)], 200)
            : Inertia::location($target);
    }
}

<?php

namespace App\Http\Responses;

use App\Support\Auth\HomePath;
use Illuminate\Http\JsonResponse;
use Inertia\Inertia;
use Laravel\Fortify\Contracts\LoginResponse as LoginResponseContract;
use Symfony\Component\HttpFoundation\Response;

/**
 * Send users to a permission-aware home instead of always /dashboard.
 */
class LoginResponse implements LoginResponseContract
{
    /**
     * {@inheritdoc}
     */
    public function toResponse($request): Response
    {
        $target = HomePath::afterLogin($request);

        // Inertia::location forces a full document visit so session + URL stay in sync
        // (avoids XHR follow → non-Inertia 404 modal while the bar still shows /login).
        return $request->wantsJson()
            ? new JsonResponse(['two_factor' => false], 200)
            : Inertia::location($target);
    }
}

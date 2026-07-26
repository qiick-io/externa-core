<?php

namespace App\Http\Responses;

use App\Support\Auth\HomePath;
use Illuminate\Http\JsonResponse;
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
        $home = HomePath::for($request->user());

        return $request->wantsJson()
            ? new JsonResponse(['two_factor' => false], 200)
            : redirect()->intended($home);
    }
}

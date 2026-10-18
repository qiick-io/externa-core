<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\Auth\OidcSocialiteFactory;
use App\Services\Auth\OidcUserResolver;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
use Laravel\Fortify\Contracts\LoginResponse as LoginResponseContract;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * OIDC authorize redirect + callback into the Fortify web session.
 */
class OidcController extends Controller
{
    public function redirect(OidcSocialiteFactory $factory): RedirectResponse
    {
        abort_unless($factory->enabled(), 404);

        return $factory->driver()->redirect();
    }

    public function callback(
        Request $request,
        OidcSocialiteFactory $factory,
        OidcUserResolver $resolver,
        LoginResponseContract $loginResponse,
    ): Response {
        abort_unless($factory->enabled(), 404);

        try {
            $socialiteUser = $factory->driver()->user();
            $user = $resolver->resolve($socialiteUser);
        } catch (ValidationException $e) {
            // IdP is the Referer; back() would bounce Keycloak↔callback forever.
            throw $e->redirectTo(route('login'));
        } catch (Throwable) {
            throw ValidationException::withMessages([
                'email' => __('SSO login failed. Try again or use email and password.'),
            ])->redirectTo(route('login'));
        }

        Auth::login($user, remember: true);

        return $loginResponse->toResponse($request);
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\Auth\LegacyOidcSubjectBridgeService;
use Illuminate\Http\Request;
use Laravel\Fortify\Contracts\LoginResponse as LoginResponseContract;
use Qiick\Oidc\Contracts\ProviderConfigurationRepositoryContract;
use Qiick\Oidc\Exceptions\OidcException;
use Qiick\Oidc\Http\Controllers\OidcCallbackController as PackageOidcCallbackController;
use Qiick\Oidc\Services\AuthorizationCodeFlowService;
use Qiick\Oidc\Services\OidcLoginService;
use Symfony\Component\HttpFoundation\Response;

/**
 * Package callback with Externa's one-release dual read of `users.oidc_sub` (#827).
 *
 * The package registers no routes here (`oidc.routes.enabled=false`); this controller owns
 * `/auth/oidc/callback` so a legacy subject can become a `user_identities` row before linking.
 * Failures reuse the package's login redirect (same English refusal messages). Success uses
 * Fortify's LoginResponse so the user lands on the permission-aware home path.
 */
final class OidcCallbackController extends Controller
{
    public function __invoke(
        Request $request,
        ProviderConfigurationRepositoryContract $configurationRepository,
        AuthorizationCodeFlowService $authorizationCodeFlow,
        LegacyOidcSubjectBridgeService $legacySubjectBridge,
        OidcLoginService $oidcLogin,
        LoginResponseContract $loginResponse,
    ): Response {
        abort_unless($configurationRepository->isEnabled(), 404);

        try {
            $identity = $authorizationCodeFlow->handleCallback($request);
            $legacySubjectBridge->promoteIfNeeded($identity);
            $secondFactorChallenge = $oidcLogin->login($request, $identity);
        } catch (OidcException $exception) {
            return PackageOidcCallbackController::backToLogin($exception);
        }

        return $secondFactorChallenge ?? $loginResponse->toResponse($request);
    }
}

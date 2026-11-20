<?php

declare(strict_types=1);

namespace App\Services\Auth;

use App\Services\Settings\Project\ProjectSecuritySettingsService;
use Qiick\Oidc\Contracts\ProviderConfigurationRepositoryContract;
use Qiick\Oidc\Data\ProviderConfigurationData;
use Qiick\Oidc\Exceptions\OidcNotConfiguredException;

/**
 * The OIDC provider of qiick/laravel-oidc, read from Settings → Authentication & Security,
 * so SSO stays configured from the UI and never from `.env`.
 *
 * The settings table is the only source: there is no fallback to `config('oidc.*')` or the
 * `OIDC_*` env vars, so an install whose settings say SSO is off can never have it switched on
 * by an env var. isEnabled() is the guard of the package's three routes (redirect, callback,
 * back-channel logout): they answer 404 while it is false. It needs SSO switched on with the
 * issuer, client id and a client secret that still decrypts (an APP_KEY change turns SSO off
 * instead of sending an empty secret).
 *
 * The issuer is used exactly as saved (trimmed): the package compares it with the discovery
 * document's `issuer` character by character, and the imported identities carry it too.
 */
final readonly class OidcSettingsRepositoryService implements ProviderConfigurationRepositoryContract
{
    public function __construct(private ProjectSecuritySettingsService $securitySettings) {}

    public function isEnabled(): bool
    {
        return $this->securitySettings->isOidcLoginAvailable();
    }

    /**
     * @throws OidcNotConfiguredException when SSO is off or incomplete
     */
    public function configuration(): ProviderConfigurationData
    {
        if (! $this->isEnabled()) {
            throw new OidcNotConfiguredException('SSO is off or incomplete in Settings → Authentication & Security.');
        }

        return new ProviderConfigurationData(
            issuer: (string) $this->securitySettings->oidcIssuer(),
            clientId: (string) $this->securitySettings->oidcClientId(),
            clientSecret: $this->securitySettings->oidcClientSecret(),
            redirectUri: route('oidc.callback'),
            scopes: ['openid', 'profile', 'email'],
            postLogoutRedirectUri: route('login'),
        );
    }
}

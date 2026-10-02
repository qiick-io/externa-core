<?php

namespace App\Services\Auth;

use App\Auth\Oidc\GenericOidcProvider;
use App\Services\Settings\ProjectSettings;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Laravel\Socialite\Two\AbstractProvider;
use RuntimeException;

/**
 * Builds a Socialite OIDC driver from project settings + issuer discovery.
 */
class OidcSocialiteFactory
{
    public function __construct(
        private readonly ProjectSettings $project,
    ) {}

    public function enabled(): bool
    {
        return $this->project->oidcEnabled()
            && $this->project->oidcIssuer() !== null
            && $this->project->oidcClientId() !== null
            && $this->project->oidcClientSecret() !== null;
    }

    public function driver(): AbstractProvider
    {
        if (! $this->enabled()) {
            throw new RuntimeException('OIDC is not configured.');
        }

        $issuer = rtrim((string) $this->project->oidcIssuer(), '/');
        $discovery = $this->discover($issuer);

        $authUrl = is_string($discovery['authorization_endpoint'] ?? null)
            ? $discovery['authorization_endpoint']
            : '';
        $tokenUrl = is_string($discovery['token_endpoint'] ?? null)
            ? $discovery['token_endpoint']
            : '';
        $userInfoUrl = is_string($discovery['userinfo_endpoint'] ?? null)
            ? $discovery['userinfo_endpoint']
            : '';

        if ($authUrl === '' || $tokenUrl === '' || $userInfoUrl === '') {
            throw new RuntimeException('OIDC discovery missing required endpoints.');
        }

        return new GenericOidcProvider(
            request(),
            (string) $this->project->oidcClientId(),
            (string) $this->project->oidcClientSecret(),
            route('auth.oidc.callback'),
            [],
            $authUrl,
            $tokenUrl,
            $userInfoUrl,
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function discover(string $issuer): array
    {
        $cacheKey = 'oidc.discovery.'.sha1($issuer);

        /** @var array<string, mixed> $cached */
        $cached = Cache::remember($cacheKey, now()->addHours(6), function () use ($issuer): array {
            $response = Http::timeout(10)
                ->acceptJson()
                ->get($issuer.'/.well-known/openid-configuration');

            if (! $response->successful()) {
                throw new RuntimeException('OIDC discovery request failed.');
            }

            $json = $response->json();

            return is_array($json) ? $json : [];
        });

        return $cached;
    }
}

<?php

namespace App\Services\Auth;

use App\Ai\Support\SafeRemoteUrlValidator;
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

    public function isEnabled(): bool
    {
        return $this->project->isOidcEnabled()
            && $this->project->oidcIssuer() !== null
            && $this->project->oidcClientId() !== null
            && $this->project->oidcClientSecret() !== null;
    }

    public function driver(): AbstractProvider
    {
        if (! $this->isEnabled()) {
            throw new RuntimeException('OIDC is not configured.');
        }

        $issuer = rtrim((string) $this->project->oidcIssuer(), '/');
        $discovery = $this->discover($issuer);
        $discovery = $this->rewriteServerEndpoints($discovery);

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
        $fetchBase = $this->dockerDiscoveryBase() ?? $issuer;

        $cacheKey = 'oidc.discovery.'.sha1($issuer.'|'.$fetchBase);

        /** @var array<string, mixed> $cached */
        $cached = Cache::remember($cacheKey, now()->addHours(6), function () use ($fetchBase): array {
            $discoveryUrl = $fetchBase.'/.well-known/openid-configuration';
            if ($ssrf = SafeRemoteUrlValidator::validateOidcEndpoint($discoveryUrl)) {
                throw new RuntimeException('OIDC discovery URL is not allowed.');
            }

            $response = Http::timeout(10)
                ->acceptJson()
                ->withOptions(['allow_redirects' => false])
                ->get($discoveryUrl);

            if (! $response->successful()) {
                throw new RuntimeException('OIDC discovery request failed.');
            }

            $json = $response->json();

            if (! is_array($json)) {
                return [];
            }

            foreach (['token_endpoint', 'userinfo_endpoint', 'authorization_endpoint'] as $key) {
                $endpoint = $json[$key] ?? null;
                if (! is_string($endpoint) || $endpoint === '') {
                    continue;
                }
                if (SafeRemoteUrlValidator::validateOidcEndpoint($endpoint) !== null) {
                    throw new RuntimeException('OIDC discovery returned a disallowed endpoint.');
                }
            }

            return $json;
        });

        return $cached;
    }

    /**
     * Rewrite token/userinfo hosts for Docker (browser issuer ≠ container DNS).
     *
     * @param  array<string, mixed>  $discovery
     * @return array<string, mixed>
     */
    private function rewriteServerEndpoints(array $discovery): array
    {
        $origin = $this->dockerServerOrigin();
        if ($origin === null) {
            return $discovery;
        }

        foreach (['token_endpoint', 'userinfo_endpoint'] as $key) {
            $url = $discovery[$key] ?? null;
            if (! is_string($url) || $url === '') {
                continue;
            }

            $discovery[$key] = (string) preg_replace('#^https?://[^/]+#', $origin, $url);
        }

        return $discovery;
    }

    /**
     * Optional Compose override; ignored under APP_ENV=testing so Pest Http::fake works.
     */
    private function dockerDiscoveryBase(): ?string
    {
        if (app()->environment('testing')) {
            return null;
        }

        $base = config('services.oidc.discovery_base');

        return is_string($base) && trim($base) !== '' ? rtrim(trim($base), '/') : null;
    }

    private function dockerServerOrigin(): ?string
    {
        if (app()->environment('testing')) {
            return null;
        }

        $origin = config('services.oidc.server_origin');

        return is_string($origin) && trim($origin) !== '' ? rtrim(trim($origin), '/') : null;
    }
}

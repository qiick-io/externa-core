<?php

namespace App\Auth\Oidc;

use Illuminate\Support\Arr;
use Laravel\Socialite\Two\AbstractProvider;
use Laravel\Socialite\Two\ProviderInterface;
use Laravel\Socialite\Two\User;

/**
 * Generic OpenID Connect Socialite driver using discovery endpoints.
 */
class GenericOidcProvider extends AbstractProvider implements ProviderInterface
{
    protected $scopeSeparator = ' ';

    /** @var list<string> */
    protected $scopes = ['openid', 'profile', 'email'];

    public function __construct(
        $request,
        $clientId,
        $clientSecret,
        $redirectUrl,
        $guzzle = [],
        protected string $authorizationEndpoint = '',
        protected string $tokenEndpoint = '',
        protected string $userInfoEndpoint = '',
    ) {
        parent::__construct($request, $clientId, $clientSecret, $redirectUrl, $guzzle);
    }

    protected function getAuthUrl($state): string
    {
        return $this->buildAuthUrlFromBase($this->authorizationEndpoint, $state);
    }

    protected function getTokenUrl(): string
    {
        return $this->tokenEndpoint;
    }

    /**
     * @param  string  $token
     * @return array<string, mixed>
     */
    protected function getUserByToken($token): array
    {
        $response = $this->getHttpClient()->get($this->userInfoEndpoint, [
            'headers' => [
                'Accept' => 'application/json',
                'Authorization' => 'Bearer '.$token,
            ],
        ]);

        /** @var array<string, mixed> $payload */
        $payload = json_decode((string) $response->getBody(), true) ?: [];

        return $payload;
    }

    /**
     * @param  array<string, mixed>  $user
     */
    protected function mapUserToObject(array $user): User
    {
        return (new User)->setRaw($user)->map([
            'id' => Arr::get($user, 'sub'),
            'nickname' => Arr::get($user, 'preferred_username'),
            'name' => Arr::get($user, 'name'),
            'email' => Arr::get($user, 'email'),
            'avatar' => Arr::get($user, 'picture'),
        ]);
    }
}

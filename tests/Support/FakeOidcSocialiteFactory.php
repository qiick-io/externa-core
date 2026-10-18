<?php

namespace Tests\Support;

use App\Services\Auth\OidcSocialiteFactory;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Two\AbstractProvider;
use Mockery;

/**
 * Test double for OIDC Socialite factory (avoids Mockery container quirks).
 */
class FakeOidcSocialiteFactory extends OidcSocialiteFactory
{
    public function __construct(
        private readonly bool $isEnabled = true,
        private readonly ?SocialiteUser $socialiteUser = null,
        private readonly ?AbstractProvider $redirectDriver = null,
    ) {
        // Skip parent constructor — tests never call discovery via this fake.
    }

    public function enabled(): bool
    {
        return $this->isEnabled;
    }

    public function driver(): AbstractProvider
    {
        if ($this->redirectDriver !== null) {
            return $this->redirectDriver;
        }

        $driver = Mockery::mock(AbstractProvider::class);
        $driver->shouldReceive('user')->andReturn($this->socialiteUser);
        $driver->shouldReceive('redirect')->andReturn(redirect('https://idp.example.com/auth'));

        return $driver;
    }
}

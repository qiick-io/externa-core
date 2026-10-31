<?php

use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Fortify\Features;

beforeEach(function (): void {
    $this->withoutVite();
});

it('disables registration by default for fresh installs', function (): void {
    expect(config('settings.project.defaults.registration_enabled'))->toBeFalse()
        ->and(app(ProjectSettings::class)->registrationEnabled())->toBeFalse();

    $this->get(route('register'))->assertForbidden();

    $this->from(route('login'))
        ->post(route('register.store'), [
            'first_name' => 'Test',
            'last_name' => 'User',
            'email' => 'blocked@example.com',
            'password' => 'password',
            'password_confirmation' => 'password',
        ])
        ->assertRedirect()
        ->assertSessionHasErrors('email');

    $this->assertGuest();
});

it('keeps an explicitly stored registration_enabled=true setting', function (): void {
    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'registration_enabled',
        true,
    );

    expect(app(ProjectSettings::class)->registrationEnabled())->toBeTrue();
});

it('throttles forgot-password by IP after five attempts', function (): void {
    $this->skipUnlessFortifyFeature(Features::resetPasswords());

    for ($i = 0; $i < 5; $i++) {
        $this->post(route('password.email'), ['email' => 'nobody@example.com'])->assertStatus(302);
    }

    $this->post(route('password.email'), ['email' => 'nobody@example.com'])->assertStatus(429);
});

it('keys the passkeys rate limiter on IP only', function (): void {
    $limiter = RateLimiter::limiter('passkeys');
    expect($limiter)->toBeCallable();

    $requestA = Request::create('/passkeys/login', 'POST', ['credential' => ['id' => 'cred-a']]);
    $requestA->server->set('REMOTE_ADDR', '203.0.113.10');

    $requestB = Request::create('/passkeys/login', 'POST', ['credential' => ['id' => 'cred-b']]);
    $requestB->server->set('REMOTE_ADDR', '203.0.113.10');

    /** @var Limit $limitA */
    $limitA = $limiter($requestA);
    /** @var Limit $limitB */
    $limitB = $limiter($requestB);

    expect($limitA->key)->toBe($limitB->key)
        ->and((string) $limitA->key)->toBe('203.0.113.10');
});

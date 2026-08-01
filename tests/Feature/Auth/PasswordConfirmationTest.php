<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;
use Laravel\Fortify\Features;

test('confirm password screen can be rendered', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get(route('password.confirm'));

    $response->assertOk();

    $response->assertInertia(fn (Assert $page) => $page
        ->component('auth/confirm-password')
        ->where('canManagePasskeys', Features::canManagePasskeys())
        ->where('hasPasskeys', false),
    );
});

test('confirm password screen exposes passkey props when user has a passkey', function () {
    $this->skipUnlessFortifyFeature(Features::passkeys());

    $user = User::factory()->create();
    $user->passkeys()->create([
        'name' => 'Confirm key',
        'credential_id' => 'cred-confirm-'.uniqid(),
        'credential' => [
            'publicKeyCredentialId' => 'cred-confirm',
            'aaguid' => '00000000-0000-0000-0000-000000000000',
        ],
    ]);

    $this->actingAs($user)
        ->get(route('password.confirm'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('auth/confirm-password')
            ->where('canManagePasskeys', true)
            ->where('hasPasskeys', true)
        );
});

test('password confirmation requires authentication', function () {
    $response = $this->get(route('password.confirm'));

    $response->assertRedirect(route('login'));
});

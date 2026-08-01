<?php

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use Database\Seeders\PermissionSeeder;
use Inertia\Testing\AssertableInertia;
use Laravel\Fortify\Features;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('project settings persist two factor required', function () {
    $user = grantProjectSettingsPermissions(User::factory()->withTwoFactor()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->put(route('project.update'), baseProjectPayload([
            'two_factor_required' => true,
        ]))
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('project.edit'));

    expect(app(ProjectSettings::class)->twoFactorRequired())->toBeTrue();

    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('project.edit'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('project.two_factor_required', true)
        );
});

test('users without two factor are redirected when required', function () {
    $this->skipUnlessFortifyFeature(Features::twoFactorAuthentication());

    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'two_factor_required',
        true,
    );

    $user = User::factory()->create();

    $this->actingAs($user)
        ->get(route('notifications.index'))
        ->assertRedirect(route('security.edit'));
});

test('security and password routes stay reachable when two factor is required', function () {
    $this->skipUnlessFortifyFeature(Features::twoFactorAuthentication());

    Features::twoFactorAuthentication([
        'confirm' => true,
        'confirmPassword' => true,
    ]);

    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'two_factor_required',
        true,
    );

    $user = User::factory()->create();

    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('security.edit'))
        ->assertOk();

    $this->actingAs($user)
        ->get(route('password.confirm'))
        ->assertOk();
});

test('users with two factor can use the app when required', function () {
    $this->skipUnlessFortifyFeature(Features::twoFactorAuthentication());

    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'two_factor_required',
        true,
    );

    $user = User::factory()->withTwoFactor()->create();

    $this->actingAs($user)
        ->get(route('notifications.index'))
        ->assertOk();
});

test('two factor is not forced when the project setting is off', function () {
    $this->skipUnlessFortifyFeature(Features::twoFactorAuthentication());

    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'two_factor_required',
        false,
    );

    $user = User::factory()->create();

    $this->actingAs($user)
        ->get(route('notifications.index'))
        ->assertOk();
});

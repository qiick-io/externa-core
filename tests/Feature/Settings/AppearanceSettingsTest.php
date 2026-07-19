<?php

use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\File;
use App\Models\Setting;
use App\Models\User;
use App\Services\Settings\SettingsRepository;
use Database\Seeders\PermissionSeeder;
use Inertia\Testing\AssertableInertia;
use Spatie\Permission\Models\Role;

function grantAppearancePermissions(User $user, array $permissions): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'test-appearance-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions($permissions);
    $user->syncRoles([$role]);

    return $user;
}

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('guests are redirected from appearance settings', function () {
    $this->get(route('appearance.edit'))->assertRedirect(route('login'));
});

test('users without permission receive 403 on appearance get and put', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->get(route('appearance.edit'))
        ->assertForbidden();

    $this->actingAs($user)
        ->put(route('appearance.update'), [
            'default_appearance' => 'dark',
        ])
        ->assertForbidden();
});

test('authorized users can view and update appearance settings', function () {
    $user = grantAppearancePermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $logo = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'logo.png',
        'path' => '/logo.png',
        'disk' => 'assets',
        'storage_path' => 'logo.png',
        'mime_type' => 'image/png',
    ]);

    $logoDark = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'logo-dark.png',
        'path' => '/logo-dark.png',
        'disk' => 'assets',
        'storage_path' => 'logo-dark.png',
        'mime_type' => 'image/png',
    ]);

    $this->actingAs($user)
        ->get(route('appearance.edit'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('settings/appearance')
            ->has('appearance')
            ->where('appearance.default_appearance', 'system')
            ->where('appearance.project_logo_dark', null)
        );

    $this->actingAs($user)
        ->put(route('appearance.update'), [
            'project_color' => '#112233',
            'project_logo_id' => $logo->id,
            'project_logo_dark_id' => $logoDark->id,
            'public_favicon_id' => null,
            'default_appearance' => 'dark',
        ])
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('appearance.edit'));

    $repository = app(SettingsRepository::class);

    expect($repository->get(SettingsRepository::SCOPE_PROJECT, 'appearance', 'project_color'))
        ->toBe('#112233')
        ->and($repository->get(SettingsRepository::SCOPE_PROJECT, 'appearance', 'project_logo'))
        ->toBe($logo->id)
        ->and($repository->get(SettingsRepository::SCOPE_PROJECT, 'appearance', 'project_logo_dark'))
        ->toBe($logoDark->id)
        ->and($repository->get(SettingsRepository::SCOPE_PROJECT, 'appearance', 'default_appearance'))
        ->toBe('dark');

    $this->actingAs($user)
        ->get(route('appearance.edit'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('appearance.project_color', '#112233')
            ->where('appearance.default_appearance', 'dark')
            ->where('appearance.project_logo.id', $logo->id)
            ->where('appearance.project_logo_dark.id', $logoDark->id)
            ->where('projectAppearance.projectColor', '#112233')
            ->where('projectAppearance.primaryForeground', '#ffffff')
            ->where('projectAppearance.defaultAppearance', 'dark')
            ->where('projectAppearance.logoUrl', fn ($url) => is_string($url) && $url !== '')
            ->where('projectAppearance.logoDarkUrl', fn ($url) => is_string($url) && $url !== '')
            ->missing('projectAppearance.publicNote')
            ->missing('projectAppearance.backgroundUrl')
            ->missing('projectAppearance.foregroundUrl')
        );
});

test('light project color yields dark primary foreground in shared appearance', function () {
    $user = grantAppearancePermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->put(route('appearance.update'), [
            'project_color' => '#f8fafc',
            'default_appearance' => 'light',
        ])
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('appearance.edit'));

    $this->actingAs($user)
        ->get(route('appearance.edit'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('projectAppearance.projectColor', '#f8fafc')
            ->where('projectAppearance.primaryForeground', '#000000')
        );
});

test('dark project logo is optional when updating appearance', function () {
    $user = grantAppearancePermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $logo = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'logo-only.png',
        'path' => '/logo-only.png',
        'disk' => 'assets',
        'storage_path' => 'logo-only.png',
        'mime_type' => 'image/png',
    ]);

    $this->actingAs($user)
        ->put(route('appearance.update'), [
            'project_color' => '#abcdef',
            'project_logo_id' => $logo->id,
            'project_logo_dark_id' => null,
            'public_favicon_id' => null,
            'default_appearance' => 'light',
        ])
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('appearance.edit'));

    $repository = app(SettingsRepository::class);

    expect($repository->get(SettingsRepository::SCOPE_PROJECT, 'appearance', 'project_logo'))
        ->toBe($logo->id)
        ->and($repository->get(SettingsRepository::SCOPE_PROJECT, 'appearance', 'project_logo_dark'))
        ->toBeNull();

    $this->actingAs($user)
        ->get(route('appearance.edit'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('appearance.project_logo.id', $logo->id)
            ->where('appearance.project_logo_dark', null)
            ->where('projectAppearance.logoDarkUrl', null)
        );
});

test('settings repository isolates project and user scopes', function () {
    $user = User::factory()->create();
    $repository = app(SettingsRepository::class);

    $repository->set(SettingsRepository::SCOPE_PROJECT, 'appearance', 'project_color', '#111111');
    $repository->set(SettingsRepository::SCOPE_USER, 'appearance', 'project_color', '#222222', $user->id);

    expect($repository->get(SettingsRepository::SCOPE_PROJECT, 'appearance', 'project_color'))
        ->toBe('#111111')
        ->and($repository->get(SettingsRepository::SCOPE_USER, 'appearance', 'project_color', $user->id))
        ->toBe('#222222')
        ->and(Setting::query()->count())
        ->toBe(2);
});

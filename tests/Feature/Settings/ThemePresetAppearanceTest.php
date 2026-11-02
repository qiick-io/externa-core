<?php

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Settings\SettingsRepositoryService;
use Database\Seeders\PermissionSeeder;
use Inertia\Testing\AssertableInertia;
use Spatie\Permission\Models\Role;

function grantThemePresetPermissions(User $user): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'test-theme-preset-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([PermissionEnum::CanManageProjectSettings->value]);
    $user->syncRoles([$role]);

    return $user;
}

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('appearance form defaults to teal preset and persists selection', function () {
    $user = grantThemePresetPermissions(User::factory()->create());

    $this->actingAs($user)
        ->get(route('appearance.edit'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('settings/appearance')
            ->where('appearance.theme_preset', 'teal')
            ->has('appearance.theme_presets', 5)
            ->where('projectAppearance.themePreset', 'teal')
        );

    $this->actingAs($user)
        ->put(route('appearance.update'), [
            'theme_preset' => 'rose',
            'project_color' => null,
            'project_color_dark' => null,
            'default_appearance' => 'system',
        ])
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('appearance.edit'));

    $repository = app(SettingsRepositoryService::class);

    expect($repository->get(SettingsRepositoryService::SCOPE_PROJECT, 'appearance', 'theme_preset'))
        ->toBe('rose');

    $this->actingAs($user)
        ->get(route('appearance.edit'))
        ->assertOk()
        ->assertSee('--primary: #AF3774', false)
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('appearance.theme_preset', 'rose')
            ->where('projectAppearance.themePreset', 'rose')
            ->where('projectAppearance.themeCss.light.primary', '#AF3774')
            ->where('projectAppearance.aiOverrideApplied', false)
        );
});

test('custom brand hex overrides preset primary via brand CSS variables', function () {
    $user = grantThemePresetPermissions(User::factory()->create());

    $this->actingAs($user)
        ->put(route('appearance.update'), [
            'theme_preset' => 'indigo',
            'project_color' => '#0f172a',
            'project_color_dark' => '#38bdf8',
            'default_appearance' => 'light',
        ])
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('appearance.edit'));

    $this->actingAs($user)
        ->get(route('appearance.edit'))
        ->assertOk()
        ->assertSee('--brand-primary: #0f172a', false)
        ->assertSee('--brand-primary-dark: #38bdf8', false)
        ->assertDontSee('--primary: #0f172a', false)
        ->assertSee('--sidebar-accent: #F7F8FF', false)
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('projectAppearance.projectColor', '#0f172a')
            ->where('projectAppearance.themePreset', 'indigo')
            ->where('projectAppearance.themeCss.brandPrimary', '#0f172a')
            ->missing('projectAppearance.themeCss.light.primary')
        );
});

test('violet preset renders teal AI CSS variables', function () {
    $user = grantThemePresetPermissions(User::factory()->create());

    $this->actingAs($user)
        ->put(route('appearance.update'), [
            'theme_preset' => 'violet',
            'project_color' => null,
            'project_color_dark' => null,
            'default_appearance' => 'system',
        ])
        ->assertSessionHasNoErrors();

    $this->actingAs($user)
        ->get(route('appearance.edit'))
        ->assertOk()
        ->assertSee('--ai: #0E7C86', false)
        ->assertSee('--primary: #7E4BC0', false)
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('projectAppearance.aiOverrideApplied', true)
            ->where('projectAppearance.themeCss.light.ai', '#0E7C86')
        );
});

test('violet-ish custom hex applies AI override on teal preset', function () {
    $user = grantThemePresetPermissions(User::factory()->create());

    $this->actingAs($user)
        ->put(route('appearance.update'), [
            'theme_preset' => 'teal',
            'project_color' => '#7F35BB',
            'project_color_dark' => null,
            'default_appearance' => 'system',
        ])
        ->assertSessionHasNoErrors();

    $this->actingAs($user)
        ->get(route('appearance.edit'))
        ->assertOk()
        ->assertSee('--brand-primary: #7F35BB', false)
        ->assertSee('--ai: #0E7C86', false)
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('projectAppearance.aiOverrideApplied', true)
            ->where('projectAppearance.themeCss.light.ai', '#0E7C86')
        );
});

<?php

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use Database\Seeders\PermissionSeeder;
use Inertia\Testing\AssertableInertia;
use Laravel\Fortify\Features;
use Spatie\Permission\Models\Role;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('guests are redirected from project settings', function () {
    $this->get(route('project.edit'))->assertRedirect(route('login'));
});

test('users without permission receive 403 on project get and put', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->get(route('project.edit'))
        ->assertForbidden();

    $this->actingAs($user)
        ->put(route('project.update'), baseProjectPayload())
        ->assertForbidden();
});

test('authorized users can view and update project settings', function () {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $role = Role::query()->firstOrCreate([
        'name' => 'member',
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);

    $this->actingAs($user)
        ->get(route('project.edit'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('settings/project')
            ->has('project')
            ->has('transformFits')
            ->has('transformFormats')
            ->where('project.default_language', 'en')
            ->where('project.registration_enabled', true)
            ->where('project.preset_transformations.0.key', 'thumbnail')
            ->where('project.revision_retention_count', null)
            ->where('project.revision_retention_days', null)
            ->where('project.files_max_upload_bytes', null)
            ->where('project.chat_max_upload_bytes', null)
        );

    $modules = config('settings.project.defaults.sidebar_modules');
    $modules[2]['enabled'] = false; // files (ai=0, dashboard=1, files=2)
    $presets = sampleTransformPresets();

    $this->actingAs($user)
        ->put(route('project.update'), baseProjectPayload([
            'name' => 'Externa HQ',
            'description' => 'Project description',
            'url' => 'https://example.com',
            'default_language' => 'it',
            'sidebar_modules' => $modules,
            'password_policy' => 'strong',
            'login_max_attempts' => 8,
            'registration_enabled' => false,
            'default_user_role' => $role->name,
            'email_verification_required' => true,
            'allowed_domains' => ['example.com', 'qiick.io'],
            'public_api_allowed_origins' => ['https://www.example.com', 'https://app.example.com'],
            'allowed_transformations' => ['thumbnail'],
            'preset_transformations' => $presets,
            'report_issue_url' => 'https://example.com/issues',
            'report_bug_url' => 'https://example.com/bugs',
            'report_error_url' => null,
            'revision_retention_count' => 50,
            'revision_retention_days' => 90,
            'files_max_upload_bytes' => 20 * 1024 * 1024,
            'chat_max_upload_bytes' => 15 * 1024 * 1024,
        ]))
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('project.edit'));

    $repository = app(SettingsRepository::class);

    expect($repository->get(SettingsRepository::SCOPE_PROJECT, 'project', 'name'))
        ->toBe('Externa HQ')
        ->and($repository->get(SettingsRepository::SCOPE_PROJECT, 'project', 'default_language'))
        ->toBe('it')
        ->and($repository->get(SettingsRepository::SCOPE_PROJECT, 'project', 'registration_enabled'))
        ->toBeFalse()
        ->and($repository->get(SettingsRepository::SCOPE_PROJECT, 'project', 'password_policy'))
        ->toBe('strong')
        ->and($repository->get(SettingsRepository::SCOPE_PROJECT, 'project', 'login_max_attempts'))
        ->toBe(8)
        ->and($repository->get(SettingsRepository::SCOPE_PROJECT, 'project', 'default_user_role'))
        ->toBe('member')
        ->and($repository->get(SettingsRepository::SCOPE_PROJECT, 'project', 'preset_transformations'))
        ->toBe($presets)
        ->and($repository->get(SettingsRepository::SCOPE_PROJECT, 'project', 'public_api_allowed_origins'))
        ->toBe(['https://www.example.com', 'https://app.example.com'])
        ->and($repository->get(SettingsRepository::SCOPE_PROJECT, 'project', 'revision_retention_count'))
        ->toBe(50)
        ->and($repository->get(SettingsRepository::SCOPE_PROJECT, 'project', 'revision_retention_days'))
        ->toBe(90)
        ->and($repository->get(SettingsRepository::SCOPE_PROJECT, 'project', 'files_max_upload_bytes'))
        ->toBe(20 * 1024 * 1024)
        ->and($repository->get(SettingsRepository::SCOPE_PROJECT, 'project', 'chat_max_upload_bytes'))
        ->toBe(15 * 1024 * 1024);

    $project = app(ProjectSettings::class);
    expect($project->maxTransformSize())->toBe(800)
        ->and($project->transformPreset('hero')['fit'])->toBe('cover')
        ->and($project->passwordPolicy())->toBe('strong')
        ->and($project->revisionRetentionCount())->toBe(50)
        ->and($project->revisionRetentionDays())->toBe(90)
        ->and($project->filesMaxUploadBytes())->toBe(20 * 1024 * 1024)
        ->and($project->chatMaxUploadBytes())->toBe(15 * 1024 * 1024);

    $this->actingAs($user)
        ->get(route('project.edit'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('project.name', 'Externa HQ')
            ->where('project.default_language', 'it')
            ->where('project.registration_enabled', false)
            ->where('project.preset_transformations.1.key', 'hero')
            ->where('project.preset_transformations.1.format', 'webp')
            ->where('name', 'Externa HQ')
            ->where('projectSettings.name', 'Externa HQ')
            ->where('projectSettings.registrationEnabled', false)
            ->where('projectSettings.reportIssueUrl', 'https://example.com/issues')
        );
});

test('legacy bare preset sizes are normalized into structured presets', function () {
    $repository = app(SettingsRepository::class);
    $repository->setMany(SettingsRepository::SCOPE_PROJECT, 'project', [
        'preset_transformations' => [64, 128],
    ]);

    $presets = app(ProjectSettings::class)->presetTransformations();

    expect($presets)->toHaveCount(2)
        ->and($presets[0]['key'])->toBe('size-64')
        ->and($presets[0]['width'])->toBe(64)
        ->and($presets[0]['fit'])->toBe('contain')
        ->and($presets[1]['key'])->toBe('size-128');
});

test('ai sidebar module stays pinned first and locked', function () {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $modules = config('settings.project.defaults.sidebar_modules');
    // Attempt to put files first and unlock/disable ai
    $modules = [
        ['id' => 'files', 'enabled' => true, 'locked' => false],
        ['id' => 'ai', 'enabled' => false, 'locked' => false],
        ['id' => 'dashboard', 'enabled' => true, 'locked' => true],
        ...array_values(array_filter(
            $modules,
            fn (array $module): bool => ! in_array($module['id'], ['ai', 'dashboard', 'files'], true),
        )),
    ];

    $this->actingAs($user)
        ->put(route('project.update'), baseProjectPayload([
            'sidebar_modules' => $modules,
        ]))
        ->assertSessionHasNoErrors();

    $this->actingAs($user)
        ->get(route('project.edit'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('project.sidebar_modules.0.id', 'ai')
            ->where('project.sidebar_modules.0.enabled', true)
            ->where('project.sidebar_modules.0.locked', true)
            ->where('projectSettings.sidebarModules.0.id', 'ai')
            ->where(
                'project.sidebar_modules',
                fn ($modules): bool => collect($modules)->contains(
                    fn (array $module): bool => $module['id'] === 'settings'
                        && $module['enabled'] === true
                        && $module['locked'] === false,
                ),
            )
        );
});

test('registration is blocked when disabled in project settings', function () {
    $this->skipUnlessFortifyFeature(Features::registration());

    $admin = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($admin)
        ->put(route('project.update'), baseProjectPayload([
            'registration_enabled' => false,
        ]))
        ->assertSessionHasNoErrors();

    auth()->logout();

    $this->get(route('register'))->assertForbidden();

    $this->post(route('register.store'), [
        'first_name' => 'Blocked',
        'last_name' => 'User',
        'email' => 'blocked@example.com',
        'password' => 'password',
        'password_confirmation' => 'password',
    ])->assertSessionHasErrors('email');

    $this->assertGuest();
    expect(User::query()->where('email', 'blocked@example.com')->exists())->toBeFalse();
});

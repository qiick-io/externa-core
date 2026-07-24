<?php

use App\Enums\PermissionEnum;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind a different classes or traits.
|
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Browser');

pest()->extend(TestCase::class)
    ->in('Unit');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

/**
 * Assign AI-related permissions to a user via a disposable test role.
 *
 * Creates a unique role per call so parallel tests do not share permission state.
 *
 * @param  list<string>  $permissions  Spatie permission names.
 */
function grantAiPermissions(User $user, array $permissions): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'test-ai-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions($permissions);
    $user->syncRoles([$role]);

    return $user;
}

/**
 * Spatie collection permission names used by admin collection routes.
 *
 * @return list<string>
 */
function allCollectionPermissions(): array
{
    return [
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanCreateCollections->value,
        PermissionEnum::CanEditCollections->value,
        PermissionEnum::CanDeleteCollections->value,
        PermissionEnum::CanRestoreCollections->value,
        PermissionEnum::CanForceDeleteCollections->value,
    ];
}

/**
 * Assign collection permissions to a user via a disposable test role.
 *
 * @param  list<string>|null  $permissions  Defaults to full collection CRUD set.
 */
function grantCollectionPermissions(User $user, ?array $permissions = null): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'test-collections-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions($permissions ?? allCollectionPermissions());
    $user->syncRoles([$role]);

    return $user;
}

/**
 * Assign project-settings permissions via a disposable test role.
 *
 * @param  list<string>  $permissions
 */
function grantProjectSettingsPermissions(User $user, array $permissions): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'test-project-settings-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions($permissions);
    $user->syncRoles([$role]);

    return $user;
}

/**
 * @return list<array<string, mixed>>
 */
function sampleTransformPresets(): array
{
    return [
        [
            'key' => 'thumbnail',
            'fit' => 'contain',
            'width' => 128,
            'height' => 128,
            'quality' => 82,
            'without_enlargement' => true,
            'format' => 'auto',
        ],
        [
            'key' => 'hero',
            'fit' => 'cover',
            'width' => 800,
            'height' => 450,
            'quality' => 90,
            'without_enlargement' => false,
            'format' => 'webp',
        ],
    ];
}

/**
 * Minimal valid payload for PUT project settings.
 *
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function baseProjectPayload(array $overrides = []): array
{
    return array_merge([
        'default_language' => 'en',
        'content_locales' => ['en', 'it'],
        'default_content_locale' => 'en',
        'fallback_content_locales' => ['en', 'it'],
        'password_policy' => 'weak',
        'login_max_attempts' => 5,
        'registration_enabled' => true,
        'email_verification_required' => false,
        'sidebar_modules' => config('settings.project.defaults.sidebar_modules'),
        'preset_transformations' => sampleTransformPresets(),
    ], $overrides);
}

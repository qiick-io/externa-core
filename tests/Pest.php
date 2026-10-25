<?php

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FilePermissionActionEnum;
use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\ApiKey;
use App\Models\Collection;
use App\Models\CollectionPermission;
use App\Models\File;
use App\Models\FilePermission;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\CollectionPermissionGuard;
use App\Services\Api\FilePermissionGuard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
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

pest()->extend(TestCase::class)
    ->in('Arch');

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

function publicRole(): Role
{
    return Role::query()->where('name', RoleEnum::Public->value)->firstOrFail();
}

/**
 * @param  list<CollectionPermissionActionEnum|string>  $actions
 */
function grantRoleActions(Role $role, Collection $collection, array $actions): void
{
    foreach ($actions as $action) {
        $value = $action instanceof CollectionPermissionActionEnum ? $action->value : $action;
        CollectionPermission::query()->updateOrCreate(
            [
                'role_id' => $role->id,
                'collection_id' => $collection->id,
                'action' => $value,
            ],
            ['allowed' => true],
        );
    }

    app(CollectionPermissionGuard::class)->forget($role->id);
}

/**
 * @param  list<CollectionPermissionActionEnum|string>  $actions
 */
function grantPublicActions(Collection $collection, array $actions): void
{
    grantRoleActions(publicRole(), $collection, $actions);
}

function makePostsCollection(): Collection
{
    return Collection::query()->create([
        'name' => 'Posts',
        'slug' => 'posts',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
}

/**
 * @return array{role: Role, plain: string, key: ApiKey}
 */
function makeApiKeyForRole(?Role $role = null): array
{
    $role ??= Role::query()->create([
        'name' => 'api-consumer-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);

    $secret = ApiKey::generateSecret();
    $key = ApiKey::query()->create([
        'name' => 'Partner',
        'key_prefix' => $secret['prefix'],
        'key_hash' => $secret['hash'],
        'role_id' => $role->id,
    ]);

    return ['role' => $role, 'plain' => $secret['plain'], 'key' => $key];
}

/**
 * Grant public Files API actions on a role (role ACL only; key scopes applied separately).
 *
 * @param  list<FilePermissionActionEnum|string>  $actions
 */
function grantFileActions(Role $role, array $actions): void
{
    foreach ($actions as $action) {
        $value = $action instanceof FilePermissionActionEnum ? $action->value : $action;
        FilePermission::query()->updateOrCreate(
            [
                'role_id' => $role->id,
                'action' => $value,
            ],
            ['allowed' => true],
        );
    }

    app(FilePermissionGuard::class)->forget($role->id);
}

/**
 * Create a stored file row for Public API tests (caller must Storage::fake('assets')).
 */
function makeStoredFile(string $name = 'hero.jpg'): File
{
    Storage::disk('assets')->put('2026/07/'.$name, 'fake-bytes');

    return File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => $name,
        'path' => '/'.$name,
        'disk' => 'assets',
        'storage_path' => '2026/07/'.$name,
        'mime_type' => 'image/jpeg',
        'size' => 10,
        'width' => 1600,
        'height' => 900,
        'hash' => hash('sha256', 'fake-bytes'),
    ]);
}

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
        PermissionEnum::CanSubmitCollections->value,
        PermissionEnum::CanApproveCollections->value,
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
 * Assign file-manager permissions via a disposable test role.
 *
 * @param  list<string>  $permissions
 */
function grantFilePermissions(User $user, array $permissions): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'test-file-manager-'.uniqid(),
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
 * Minimal valid payload for PUT general project settings.
 *
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function baseProjectPayload(array $overrides = []): array
{
    return array_merge([
        'name' => null,
        'description' => null,
        'url' => null,
        'report_issue_url' => null,
        'report_bug_url' => null,
        'report_error_url' => null,
    ], $overrides);
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function baseLocalizationPayload(array $overrides = []): array
{
    return array_merge([
        'default_language' => 'en',
        'content_locales' => ['en', 'it'],
        'default_content_locale' => 'en',
        'fallback_content_locales' => ['en', 'it'],
    ], $overrides);
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function baseSecurityPayload(array $overrides = []): array
{
    return array_merge([
        'password_policy' => 'weak',
        'login_max_attempts' => 5,
        'registration_enabled' => true,
        'email_verification_required' => false,
        'two_factor_required' => false,
        'oidc_enabled' => false,
        'oidc_jit_provisioning' => false,
    ], $overrides);
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function baseContentPayload(array $overrides = []): array
{
    return array_merge([
        'preview_url_default' => null,
        'revision_retention_count' => null,
        'revision_retention_days' => null,
    ], $overrides);
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function baseFilesPayload(array $overrides = []): array
{
    return array_merge([
        'files_max_upload_bytes' => null,
        'chat_max_upload_bytes' => null,
        'allowed_transformations' => [],
        'preset_transformations' => sampleTransformPresets(),
    ], $overrides);
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function baseApiPayload(array $overrides = []): array
{
    return array_merge([
        'public_api_allowed_origins' => [],
    ], $overrides);
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function baseIntegrationsPayload(array $overrides = []): array
{
    return array_merge([
        'webhook_url' => null,
        'webhook_secret' => null,
        'notifier_slack_webhook_url' => null,
        'notifier_telegram_bot_token' => null,
        'notifier_telegram_chat_id' => null,
    ], $overrides);
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function baseSidebarPayload(array $overrides = []): array
{
    return array_merge([
        'sidebar_modules' => config('settings.project.defaults.sidebar_modules'),
    ], $overrides);
}

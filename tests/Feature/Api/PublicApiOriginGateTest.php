<?php

use App\Enums\CollectionPermissionAction;
use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Cache;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    Cache::forget(ProjectSettings::PUBLIC_API_ORIGINS_CACHE_KEY);
});

it('skips the origin gate when allowlist is empty', function (): void {
    $collection = makePostsCollection();
    grantPublicActions($collection, [CollectionPermissionAction::Read]);

    $this->getJson('/api/v1/collections')
        ->assertOk()
        ->assertJsonFragment(['slug' => 'posts']);
});

it('allows matching Origin and rejects mismatched Origin when allowlist is set', function (): void {
    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'public_api_allowed_origins',
        ['https://app.example'],
    );
    app(ProjectSettings::class)->forgetPublicApiAllowedOriginsCache();

    $collection = makePostsCollection();
    grantPublicActions($collection, [CollectionPermissionAction::Read]);

    $this->withHeader('Origin', 'https://app.example')
        ->getJson('/api/v1/collections')
        ->assertOk()
        ->assertJsonFragment(['slug' => 'posts']);

    $this->withHeader('Origin', 'https://evil.example')
        ->getJson('/api/v1/collections')
        ->assertForbidden()
        ->assertJsonPath('message', 'Origin not allowed.');
});

it('requires a valid API key when Origin is absent and allowlist is set', function (): void {
    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'public_api_allowed_origins',
        ['https://app.example'],
    );
    app(ProjectSettings::class)->forgetPublicApiAllowedOriginsCache();

    $collection = makePostsCollection();
    grantPublicActions($collection, [CollectionPermissionAction::Read]);

    $this->getJson('/api/v1/collections')
        ->assertForbidden()
        ->assertJsonPath('message', 'Origin required or API key.');

    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $collection, [CollectionPermissionAction::Read]);

    $this->withToken($auth['plain'])
        ->getJson('/api/v1/collections')
        ->assertOk()
        ->assertJsonFragment(['slug' => 'posts']);
});

it('enforces the same origin gate on GraphQL', function (): void {
    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'public_api_allowed_origins',
        ['https://app.example'],
    );
    app(ProjectSettings::class)->forgetPublicApiAllowedOriginsCache();

    $collection = makePostsCollection();
    grantPublicActions($collection, [CollectionPermissionAction::Read]);

    $query = ['query' => '{ __typename }'];

    $this->postJson('/api/graphql', $query)
        ->assertForbidden()
        ->assertJsonPath('message', 'Origin required or API key.');

    $this->withHeader('Origin', 'https://evil.example')
        ->postJson('/api/graphql', $query)
        ->assertForbidden()
        ->assertJsonPath('message', 'Origin not allowed.');

    $this->withHeader('Origin', 'https://app.example')
        ->postJson('/api/graphql', $query)
        ->assertOk();

    $auth = makeApiKeyForRole();
    $this->withToken($auth['plain'])
        ->postJson('/api/graphql', $query)
        ->assertOk();
});

it('allows anonymous GraphQL when allowlist is empty', function (): void {
    $query = ['query' => '{ __typename }'];

    $this->postJson('/api/graphql', $query)->assertOk();
});

it('applies project origins to CORS config for api paths', function (): void {
    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'public_api_allowed_origins',
        ['https://app.example', 'https://www.example'],
    );
    app(ProjectSettings::class)->forgetPublicApiAllowedOriginsCache();

    $this->withHeaders([
        'Origin' => 'https://app.example',
        'Access-Control-Request-Method' => 'GET',
    ])->options('/api/v1/collections')
        ->assertNoContent()
        ->assertHeader('Access-Control-Allow-Origin', 'https://app.example');

    // Multiple allowlisted origins → Fruitcake only echoes Origin when it matches
    $this->withHeaders([
        'Origin' => 'https://evil.example',
        'Access-Control-Request-Method' => 'GET',
    ])->options('/api/v1/collections')
        ->assertNoContent()
        ->assertHeaderMissing('Access-Control-Allow-Origin');
});

it('invalidates origins cache when project settings are saved', function (): void {
    $user = grantProjectSettingsPermissions(
        User::factory()->create(),
        [PermissionEnum::CanManageProjectSettings->value],
    );

    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'public_api_allowed_origins',
        ['https://old.example'],
    );

    expect(app(ProjectSettings::class)->publicApiAllowedOrigins())
        ->toBe(['https://old.example']);

    $this->withoutVite();
    $this->actingAs($user)
        ->put(route('project.update'), baseProjectPayload([
            'public_api_allowed_origins' => ['https://new.example'],
        ]))
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('project.edit'));

    expect(app(ProjectSettings::class)->publicApiAllowedOrigins())
        ->toBe(['https://new.example']);
});

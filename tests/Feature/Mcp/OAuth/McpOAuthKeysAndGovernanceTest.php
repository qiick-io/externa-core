<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Models\ApiKey;
use App\Models\OAuthBlockedRedirectHost;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Laravel\Passport\Client;
use Tests\Support\McpOAuthTestHelpers as OAuth;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

it('answers 503 with a clear error when OAuth is on but Passport keys are missing', function (): void {
    config([
        'ai.mcp.enabled' => true,
        'ai.mcp.oauth.enabled' => true,
        'passport.private_key' => null,
        'passport.public_key' => null,
    ]);

    // Avoid leftover key files from other tests in this process.
    foreach (['oauth-private.key', 'oauth-public.key'] as $fileName) {
        $path = storage_path($fileName);
        if (is_file($path)) {
            unlink($path);
        }
    }

    $this->getJson('/.well-known/oauth-authorization-server')
        ->assertStatus(503)
        ->assertJsonPath('error', 'temporarily_unavailable');

    $this->postJson('/oauth/register', [
        'client_name' => 'Claude',
        'redirect_uris' => [OAuth::REDIRECT_URI],
    ])->assertStatus(503)->assertJsonPath('error', 'temporarily_unavailable');
});

it('reports passport_keys on the ready probe only while OAuth is configured on', function (): void {
    OAuth::enableOAuth();

    $this->getJson('/health/ready')->assertOk()->assertJsonPath('checks.passport_keys', 'ok');

    config(['ai.mcp.oauth.enabled' => false]);

    expect($this->getJson('/health/ready')->json('checks'))->not->toHaveKey('passport_keys');
});

it('lists clients for an admin and blocks a client so its tokens are refused', function (): void {
    OAuth::enableOAuth();

    $role = Role::query()->create([
        'name' => 'mcp-oauth-admin-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $role->syncPermissions([
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanManageApiKeys->value,
        ...allCollectionPermissions(),
    ]);
    $admin = User::factory()->create(['is_active' => true]);
    $admin->syncRoles([$role]);

    $issued = OAuth::issueAccessToken($this, $admin, ['scopes' => ['mcp:read'], 'role_id' => $role->id]);

    $this->actingAs($admin)
        ->get('/settings/mcp-oauth-clients')
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('admin/mcp-oauth-clients/index')
            ->has('clients', 1)
            ->where('clients.0.id', $issued['client_id']));

    $this->actingAs($admin)
        ->post('/settings/mcp-oauth-clients/'.$issued['client_id'].'/block')
        ->assertRedirect();

    expect(Client::query()->findOrFail($issued['client_id'])->revoked)->toBeTrue()
        ->and($issued['grant']->fresh()->isRevoked())->toBeTrue();

    OAuth::mcpRequest($this, $issued['access_token'])->assertUnauthorized();
});

it('lets an admin block and unblock a redirect host', function (): void {
    OAuth::enableOAuth();

    $role = Role::query()->create([
        'name' => 'mcp-oauth-host-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $role->givePermissionTo(PermissionEnum::CanManageApiKeys->value);
    $admin = User::factory()->create(['is_active' => true]);
    $admin->syncRoles([$role]);

    $this->actingAs($admin)
        ->post('/settings/mcp-oauth-clients/blocked-hosts', ['host' => 'Evil.Example'])
        ->assertRedirect();

    expect(OAuthBlockedRedirectHost::query()->where('host', 'evil.example')->exists())->toBeTrue();

    $blockedHost = OAuthBlockedRedirectHost::query()->where('host', 'evil.example')->sole();

    $this->actingAs($admin)
        ->delete('/settings/mcp-oauth-clients/blocked-hosts/'.$blockedHost->id)
        ->assertRedirect();

    expect(OAuthBlockedRedirectHost::query()->count())->toBe(0);
});

it('prunes unused OAuth clients older than the retention window', function (): void {
    OAuth::enableOAuth();

    $owner = User::factory()->create();
    $role = Role::query()->create([
        'name' => 'mcp-oauth-prune-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);

    $unused = Client::factory()->asPublic()->create([
        'name' => 'Unused',
        'redirect_uris' => [OAuth::REDIRECT_URI],
        'created_at' => now()->subDays(40),
    ]);
    $kept = Client::factory()->asPublic()->create([
        'name' => 'Kept',
        'redirect_uris' => [OAuth::REDIRECT_URI],
        'created_at' => now()->subDays(40),
    ]);
    ApiKey::query()->create([
        'name' => 'grant',
        'key_prefix' => 'oauth_kept',
        'key_hash' => ApiKey::hashSecret('secret'),
        'oauth_client_id' => $kept->getKey(),
        'owner_id' => $owner->id,
        'created_by' => $owner->id,
        'role_id' => $role->id,
        'scopes' => ['mcp:read'],
    ]);

    $this->artisan('mcp:prune-unused-oauth-clients')->assertSuccessful();

    expect(Client::query()->whereKey($unused->getKey())->exists())->toBeFalse()
        ->and(Client::query()->whereKey($kept->getKey())->exists())->toBeTrue();
});

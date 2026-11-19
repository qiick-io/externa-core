<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Models\ApiKey;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Laravel\Passport\AuthCode;
use Laravel\Passport\RefreshToken;
use Laravel\Passport\Token;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\McpOAuthTestHelpers as OAuth;

/**
 * Revoking a remote MCP client from Settings → Connected apps (#802): it takes effect on the
 * client's next call and its next refresh, the activity log names the client, and a user can
 * only ever see and revoke their own grants.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
    OAuth::enableOAuth();

    $this->role = Role::query()->create([
        'name' => 'mcp-oauth-revocation-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $this->role->syncPermissions([PermissionEnum::CanUseAi->value, ...allCollectionPermissions()]);

    $this->user = User::factory()->create(['is_active' => true]);
    $this->user->syncRoles([$this->role]);
});

it('lists the user\'s own active connected apps, and nothing else', function (): void {
    $mine = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read', 'collections:write'], 'role_id' => $this->role->id]);
    $revoked = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
    $revoked['grant']->forceFill(['revoked_at' => now()])->save();
    $colleague = User::factory()->create(['is_active' => true]);
    $colleague->syncRoles([$this->role]);
    OAuth::issueAccessToken($this, $colleague, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
    OAuth::issueApiKey($this->user, $this->role, ['mcp:read']);

    $page = $this->actingAs($this->user)->get('/settings/connected-apps')->assertOk();

    expect($page->inertiaPage()['component'])->toBe('settings/connected-apps')
        ->and($page->inertiaProps('connectedApps'))->toBe([[
            'id' => $mine['grant']->id,
            'name' => 'Claude',
            'redirectHosts' => ['claude.ai'],
            'scopes' => ['collections:write', 'mcp:read'],
            'role' => $this->role->name,
            'collectionSlugs' => null,
            'authorizedAt' => $mine['grant']->created_at?->toIso8601String(),
            'lastUsedAt' => null,
        ]]);
});

it('revokes a client so its next call and its next refresh are refused', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
    OAuth::mcpRequest($this, $issued['access_token'])->assertOk();

    $this->actingAs($this->user)
        ->delete('/settings/connected-apps/'.$issued['grant']->id)
        ->assertRedirect('/settings/connected-apps')
        ->assertSessionHas('success', 'Claude can no longer use this workspace.');
    auth()->forgetGuards();

    OAuth::mcpRequest($this, $issued['access_token'])
        ->assertUnauthorized()
        ->assertJsonPath('error', 'invalid_token')
        ->assertJsonPath('message', 'The access token has been revoked.');

    $this->post('/oauth/token', [
        'grant_type' => 'refresh_token',
        'refresh_token' => $issued['refresh_token'],
        'client_id' => $issued['client_id'],
    ])->assertStatus(400)->assertJsonPath('error', 'invalid_grant');

    expect($issued['grant']->fresh()->isRevoked())->toBeTrue()
        ->and(Token::query()->where('client_id', $issued['client_id'])->where('revoked', false)->count())->toBe(0)
        ->and(RefreshToken::query()->where('revoked', false)->count())->toBe(0);
});

it('revokes the codes the client has not exchanged yet', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
    $pkce = OAuth::pkcePair();
    $consentPage = OAuth::openConsent($this, $this->user, $issued['client_id'], $pkce['challenge'], 'mcp:read');
    $code = OAuth::codeFrom(OAuth::approve($this, $consentPage, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]));

    $grant = ApiKey::query()->where('oauth_client_id', $issued['client_id'])->whereNull('revoked_at')->sole();
    $this->actingAs($this->user)->delete('/settings/connected-apps/'.$grant->id)->assertRedirect();

    OAuth::exchangeCode($this, $issued['client_id'], $code, $pkce['verifier'])->assertStatus(400)->assertJsonPath('error', 'invalid_grant');
    expect(AuthCode::query()->where('revoked', false)->count())->toBe(0);
});

it('logs the revocation, naming the client', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);

    $this->actingAs($this->user)->delete('/settings/connected-apps/'.$issued['grant']->id);
    $this->actingAs($this->user)->delete('/settings/connected-apps/'.$issued['grant']->id);

    $entry = Activity::query()->where('log_name', 'api-keys')->where('event', 'oauth_revoked')->sole();

    expect($entry->causer_id)->toBe($this->user->id)
        ->and($entry->subject_id)->toBe($issued['grant']->id)
        ->and($entry->properties->get('name'))->toBe('Claude')
        ->and($entry->properties->get('oauth_client_id'))->toBe($issued['client_id']);
});

it('lets a user revoke their own client even after their AI access was taken away', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
    $this->role->revokePermissionTo(PermissionEnum::CanUseAi->value);

    $this->actingAs($this->user)->delete('/settings/connected-apps/'.$issued['grant']->id)->assertRedirect();

    expect($issued['grant']->fresh()->isRevoked())->toBeTrue();
});

it('does not find someone else\'s grant, or an API key', function (): void {
    $colleague = User::factory()->create(['is_active' => true]);
    $colleague->syncRoles([$this->role]);
    $theirs = OAuth::issueAccessToken($this, $colleague, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
    OAuth::issueApiKey($this->user, $this->role, ['mcp:read']);
    $apiKey = ApiKey::query()->whereNull('oauth_client_id')->sole();

    $this->actingAs($this->user)->delete('/settings/connected-apps/'.$theirs['grant']->id)->assertNotFound();
    $this->actingAs($this->user)->delete('/settings/connected-apps/'.$apiKey->id)->assertNotFound();

    expect($theirs['grant']->fresh()->isRevoked())->toBeFalse()
        ->and($apiKey->fresh()->isRevoked())->toBeFalse();
});

it('withdraws the client\'s tokens too when the owner is deactivated', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);

    $this->user->forceFill(['is_active' => false])->save();

    expect($issued['grant']->fresh()->isRevoked())->toBeTrue()
        ->and(Token::query()->where('client_id', $issued['client_id'])->where('revoked', false)->count())->toBe(0)
        ->and(RefreshToken::query()->where('revoked', false)->count())->toBe(0);
});

it('hides Connected apps while OAuth is off', function (): void {
    $this->actingAs($this->user)->get('/settings/profile')->assertInertia(fn ($page) => $page->where('isMcpOAuthEnabled', true));

    config(['ai.mcp.oauth.enabled' => false]);

    $this->actingAs($this->user)->get('/settings/connected-apps')->assertNotFound();
    $this->actingAs($this->user)->get('/settings/profile')->assertInertia(fn ($page) => $page->where('isMcpOAuthEnabled', false));
});

it('hides a grant and refuses tokens after an admin blocks the client', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);

    $adminRole = Role::query()->create([
        'name' => 'mcp-oauth-block-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $adminRole->givePermissionTo(PermissionEnum::CanManageApiKeys->value);
    $admin = User::factory()->create(['is_active' => true]);
    $admin->syncRoles([$adminRole]);

    $this->actingAs($admin)
        ->post('/settings/mcp-oauth-clients/'.$issued['client_id'].'/block')
        ->assertRedirect();

    expect($issued['grant']->fresh()->isRevoked())->toBeTrue();

    $this->actingAs($this->user)
        ->get('/settings/connected-apps')
        ->assertOk()
        ->assertInertia(fn ($page) => $page->has('connectedApps', 0));

    OAuth::mcpRequest($this, $issued['access_token'])->assertUnauthorized();
});

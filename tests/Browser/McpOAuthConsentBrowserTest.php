<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Models\ApiKey;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Tests\Support\McpOAuthTestHelpers as OAuth;

/**
 * The consent screen for a remote MCP client (#802) in a real browser: no critical or serious
 * axe issue in light and dark, the host the approval returns to is visible, and approving with
 * the keyboard-reachable form records the narrowed grant.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    OAuth::enableOAuth();

    $this->role = Role::query()->create([
        'name' => 'mcp-oauth-browser-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $this->role->syncPermissions([PermissionEnum::CanUseAi->value, ...allCollectionPermissions()]);

    $this->user = User::factory()->create(['is_active' => true]);
    $this->user->syncRoles([$this->role]);
    $this->clientId = OAuth::registerClient($this);
});

it('has no critical or serious axe issues in light and dark, and names the return host', function (string $mode): void {
    $this->actingAs($this->user);
    $url = OAuth::authorizationUrl($this->clientId, OAuth::pkcePair()['challenge'], 'mcp:read collections:write');

    $page = $mode === 'dark' ? visit($url)->inDarkMode() : visit($url)->inLightMode();

    $page->assertSee('Claude')
        ->assertSeeIn('[data-test="oauth-redirect-host"]', 'claude.ai')
        ->assertPresent('[data-test="oauth-scope-collections:read"]')
        ->assertPresent('[data-test="oauth-approve"]')
        ->assertNoAccessibilityIssues(1)
        ->assertNoJavaScriptErrors();
})->with(['light', 'dark']);

it('records only what the user left ticked', function (): void {
    $this->actingAs($this->user);
    // Least privilege: only mcp:read is pre-ticked; the user opts into collections:read.
    // No collections exist in this fixture, so the all-collections control is absent and
    // an empty collection choice is allowed.
    $url = OAuth::authorizationUrl($this->clientId, OAuth::pkcePair()['challenge']);

    visit($url)
        ->click('#scope-collections\:read')
        ->click('[data-test="oauth-approve"]')
        ->wait(1);

    expect(ApiKey::query()->where('oauth_client_id', $this->clientId)->sole()->scopes)
        ->toBe(['collections:read', 'mcp:read']);
});

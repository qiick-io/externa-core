<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Tests\Support\McpOAuthTestHelpers as OAuth;

/**
 * Settings → Connected apps (#802) in a real browser: no critical or serious axe issue in light
 * and dark, the nav entry sits with the access settings, and Revoke goes through the confirm
 * dialog.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    OAuth::enableOAuth();

    $this->role = Role::query()->create([
        'name' => 'mcp-oauth-connected-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $this->role->syncPermissions([PermissionEnum::CanUseAi->value, ...allCollectionPermissions()]);

    $this->user = User::factory()->create(['is_active' => true]);
    $this->user->syncRoles([$this->role]);
    $this->issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read', 'collections:read'], 'role_id' => $this->role->id]);
});

it('has no critical or serious axe issues in light and dark', function (string $mode): void {
    $this->actingAs($this->user);

    $page = $mode === 'dark' ? visit('/settings/connected-apps')->inDarkMode() : visit('/settings/connected-apps')->inLightMode();

    $page->assertSee('Claude')
        ->assertSee('claude.ai')
        ->assertSee('Connected apps')
        ->assertNoAccessibilityIssues(1)
        ->assertNoJavaScriptErrors();
})->with(['light', 'dark']);

it('revokes through the confirm dialog', function (): void {
    $this->actingAs($this->user);

    visit('/settings/connected-apps')
        ->click('[data-test="connected-app-revoke-'.$this->issued['grant']->id.'"]')
        ->assertSee('Revoke Claude?')
        ->click('Revoke access')
        ->assertSee('No connected apps');

    expect($this->issued['grant']->fresh()->isRevoked())->toBeTrue();
});

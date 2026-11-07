<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Presence is one shadcn AvatarBadge, bottom-right inside the avatar: grey for
 * an offline user in the users list, and the realtime connection badge on the
 * signed-in user's sidebar avatar.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $admin = User::factory()->create();
    $admin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($admin);
});

it('shows an offline user with a solid grey badge inside the avatar', function (): void {
    User::factory()->create(['first_name' => 'Offline', 'last_name' => 'Person']);

    $page = visit('/users');

    $badge = "document.querySelector('[data-test=\"user-online-dot\"][data-online=\"0\"]')";

    $page->assertSee('Offline Person')
        ->assertScript("{$badge}.dataset.slot === 'avatar-badge'")
        ->assertScript("{$badge}.parentElement.dataset.slot === 'avatar'")
        ->assertScript("getComputedStyle({$badge}).backgroundColor !== 'rgba(0, 0, 0, 0)'")
        ->assertNoJavaScriptErrors();
});

it('puts the realtime connection badge bottom-right on the sidebar avatar', function (): void {
    $page = visit('/dashboard');

    $badge = "document.querySelector('[data-test=\"realtime-connection-dot\"]')";

    $page->assertPresent('[data-test="realtime-connection-dot"]')
        ->assertScript("{$badge}.parentElement.dataset.slot === 'avatar'")
        ->assertScript("(() => { const b = {$badge}.getBoundingClientRect(); const a = {$badge}.parentElement.getBoundingClientRect(); return Math.round(b.right) === Math.round(a.right) && Math.round(b.bottom) === Math.round(a.bottom); })()")
        ->assertNoJavaScriptErrors();
});

<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Clear buttons inside inputs are InputGroupButtons; the user Active flag is
 * a shadcn Checkbox.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);
});

it('clears the collection color and the icon search from their input groups', function (): void {
    visit('/collections')
        ->click('New collection')
        ->wait(0.5)
        ->type('input[placeholder="#64748B"]', '#ff0000')
        ->click('button[aria-label="Clear color"]')
        ->assertValue('input[placeholder="#64748B"]', '')
        ->click('#collection_drawer_icon')
        ->type('input[placeholder="Search icons…"]', 'zzzz')
        ->click('button[aria-label="Clear search"]')
        ->assertValue('input[placeholder="Search icons…"]', '')
        ->assertNoJavaScriptErrors();
});

it('toggles the user Active flag with a checkbox', function (): void {
    visit('/users')
        ->click('New user')
        ->wait(0.5)
        ->assertAttribute('#user_is_active', 'role', 'checkbox')
        ->assertAttribute('#user_is_active', 'aria-checked', 'true')
        ->click('#user_is_active')
        ->assertAttribute('#user_is_active', 'aria-checked', 'false')
        ->assertNoJavaScriptErrors();
});

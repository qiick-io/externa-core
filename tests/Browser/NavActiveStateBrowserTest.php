<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

it('marks the active sidebar item with data-active and passes axe on the dashboard', function () {
    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $page = visit('/dashboard');

    $page->assertPresent('[data-sidebar="menu-button"][data-active="true"]')
        ->assertScript(
            '() => document.querySelectorAll(\'[data-sidebar="menu-button"][data-active="true"]\').length >= 1',
            true,
        )
        ->assertNoAccessibilityIssues(1)
        ->assertNoJavaScriptErrors();
});

<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Dashboard views (Overview / Health) are line tabs under the page header,
 * each with its own URL (app-ui `docs/page.md`, "Views: tabs under the header").
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);
});

it('switches dashboard views from the tabs under the header', function () {
    $page = visit('/dashboard');

    $page->assertMissing('header [data-test="dashboard-tabs"]')
        ->assertPresent('[data-test="dashboard-tabs"]')
        ->assertAttribute('[data-test="dashboard-tab-overview"]', 'data-state', 'active')
        ->click('[data-test="dashboard-tab-health"]')
        ->assertPathIs('/dashboard/health')
        ->assertPresent('[data-test="dashboard-health"]')
        ->assertAttribute('[data-test="dashboard-tab-health"]', 'data-state', 'active')
        ->click('[data-test="dashboard-tab-overview"]')
        ->assertPathIs('/dashboard')
        ->assertAttribute('[data-test="dashboard-tab-overview"]', 'data-state', 'active')
        ->assertNoJavaScriptErrors();
});

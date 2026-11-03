<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Dashboard tabs are a segmented control in the page header, on the right,
 * like the creation buttons on the other pages.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);
});

it('switches dashboard tabs from the segmented control in the header', function () {
    $page = visit('/dashboard');

    $page->assertPresent('header [data-test="dashboard-tabs"]')
        ->assertAttribute('[data-test="dashboard-tab-overview"]', 'data-state', 'on')
        ->click('[data-test="dashboard-tab-health"]')
        ->assertQueryStringHas('tab', 'health')
        ->assertAttribute('[data-test="dashboard-tab-health"]', 'data-state', 'on')
        ->click('[data-test="dashboard-tab-overview"]')
        ->assertAttribute('[data-test="dashboard-tab-overview"]', 'data-state', 'on')
        ->assertNoJavaScriptErrors();
});

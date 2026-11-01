<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

it('has no critical/serious axe issues on login with success status token', function () {
    $page = visit('/login');

    $page->assertSee('Skip to content')
        ->assertPresent('#main-content')
        ->assertNoAccessibilityIssues(1)
        ->assertNoJavaScriptErrors();
});

it('shows textual user active status and passes axe in light and dark', function () {
    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    foreach (['light', 'dark'] as $mode) {
        $page = visit('/users');

        if ($mode === 'dark') {
            $page->assertScript(
                '() => { document.documentElement.classList.add("dark"); return document.documentElement.classList.contains("dark"); }',
                true,
            );
        }

        $page->assertSee('Active')
            ->assertNoAccessibilityIssues(1)
            ->screenshot(false, "a11y-235-users-{$mode}")
            ->assertNoJavaScriptErrors();
    }
});

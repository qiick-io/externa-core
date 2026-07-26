<?php

use App\Models\User;
use Database\Seeders\PermissionSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
});

it('toggles accessibility preferences onto html and cookies from the user menu', function () {
    $user = User::factory()->create([
        'email' => 'a11y-browser@example.com',
        'password' => 'password',
    ]);

    $this->actingAs($user);

    $page = visit('/settings/profile');

    $page->assertSee('Skip to content')
        ->assertPresent('#main-content')
        ->assertNoJavaScriptErrors()
        ->click('[data-test="sidebar-menu-button"]')
        ->wait(0.3)
        ->assertSee('Accessibility')
        ->click('[data-test="accessibility-menu"]')
        ->wait(0.2)
        ->assertSee('High contrast')
        ->assertSee('Reduce motion')
        ->click('[data-test="accessibility-high-contrast"]')
        ->wait(0.2)
        ->assertScript(
            'document.documentElement.classList.contains("high-contrast")',
            true,
        )
        ->click('[data-test="accessibility-reduce-motion"]')
        ->wait(0.2)
        ->assertScript(
            'document.documentElement.classList.contains("reduce-motion")',
            true,
        )
        ->assertScript(
            "document.cookie.includes('accessibility_high_contrast=1')",
            true,
        )
        ->assertScript(
            "document.cookie.includes('accessibility_reduce_motion=1')",
            true,
        )
        ->assertNoJavaScriptErrors();
});

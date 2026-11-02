<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

it('exposes skip link and a single main landmark on login', function () {
    $page = visit('/login');

    $page->assertSee('Skip to content')
        ->assertPresent('a[href="#main-content"]')
        ->assertPresent('#main-content')
        ->assertScript(
            '() => document.querySelectorAll("main").length === 1',
            true,
        )
        ->assertNoAccessibilityIssues(1)
        ->assertNoJavaScriptErrors();
});

it('exposes skip link, main, and labelled nav on the dashboard', function () {
    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $page = visit('/dashboard');

    $page->assertSee('Skip to content')
        ->assertPresent('#main-content')
        ->assertScript(
            '() => document.querySelectorAll("main").length === 1',
            true,
        )
        ->assertScript(
            '() => document.querySelectorAll(\'nav[aria-label="Main navigation"]\').length >= 1',
            true,
        )
        ->assertPresent('[aria-label]')
        ->assertNoAccessibilityIssues(1)
        ->assertNoJavaScriptErrors();
});

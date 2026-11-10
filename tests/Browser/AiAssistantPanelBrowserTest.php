<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * The sidebar Assistant item goes to /ai; its hover action and ⌘J / Ctrl+J
 * open the assistant as a side panel on the current page. No floating button.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $admin = User::factory()->create();
    $admin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($admin);
});

it('links the sidebar Assistant item to the full page', function (): void {
    $page = visit('/dashboard');

    $page->assertAttribute('a.sidebar-ai-nav', 'href', '/ai')
        ->assertNoJavaScriptErrors();
});

it('opens the assistant panel from the sidebar hover action without leaving the page', function (): void {
    $page = visit('/dashboard');

    $page->assertMissing('[data-slot="ai-fab"]')
        ->assertMissing('[role="dialog"]')
        ->hover('a.sidebar-ai-nav')
        ->click('[data-test="sidebar-ai-panel"]')
        ->assertPresent('[role="dialog"] [data-testid="ai-panel-full-page"]')
        ->assertPathIs('/dashboard')
        ->assertNoJavaScriptErrors();
});

it('toggles the assistant panel with the keyboard shortcut', function (): void {
    $page = visit('/dashboard');

    $page->script("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }))");
    $page->assertPresent('[role="dialog"] [data-testid="ai-panel-full-page"]');

    $page->script("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }))");
    $page->wait(0.5)
        ->assertMissing('[data-testid="ai-panel-full-page"]')
        ->assertNoJavaScriptErrors();
});

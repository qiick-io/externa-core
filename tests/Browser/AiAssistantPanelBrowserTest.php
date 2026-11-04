<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * The AI assistant opens as a side panel on the current page from the sidebar
 * Assistant item or ⌘J / Ctrl+J; there is no floating button any more.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $admin = User::factory()->create();
    $admin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($admin);
});

it('opens the assistant panel from the sidebar without leaving the page', function (): void {
    $page = visit('/dashboard');

    $page->assertMissing('[data-slot="ai-fab"]')
        ->assertMissing('[role="dialog"]')
        ->click('.sidebar-ai-nav')
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

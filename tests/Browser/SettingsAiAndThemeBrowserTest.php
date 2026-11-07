<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Settings polish: AI pages grouped under an "AI" nav label, the AI tools page
 * uses the shared sticky save bar with checkboxes aligned to their titles, and
 * the appearance preview keeps the two-tone dark shell (TS preset mirror).
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $admin = User::factory()->create();
    $admin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($admin);
});

it('groups the AI settings pages under an AI label', function (): void {
    $page = visit('/settings/ai-tools');

    $page->assertScript(<<<'JS'
(() => {
  const group = [...document.querySelectorAll('[data-sidebar="group"]')]
    .find((element) => element.querySelector('[data-sidebar="group-label"]')?.textContent.trim() === 'AI');

  return Boolean(group?.querySelector('a[href="/settings/ai-tools"]') && group?.querySelector('a[href="/settings/pending-tool-calls"]'));
})()
JS)
        ->assertNoJavaScriptErrors();
});

it('uses the sticky save bar and aligns each checkbox with its tool title', function (): void {
    $page = visit('/settings/ai-tools');

    $page->assertPresent('[data-test="ai-tools-settings-save"] svg')
        ->assertScript(<<<'JS'
(() => {
  const bar = document.querySelector('[data-test="ai-tools-settings-save"]').closest('.sticky');
  const row = document.querySelector('[data-test^="ai-tool-"]');
  const checkbox = row.querySelector('[role="checkbox"]').getBoundingClientRect();
  const label = row.querySelector('[data-slot="field-label"]').getBoundingClientRect();

  return bar !== null && Math.abs((checkbox.top + checkbox.height / 2) - (label.top + Math.min(label.height, 20) / 2)) <= 3;
})()
JS)
        ->assertNoJavaScriptErrors();
});

it('keeps the two-tone dark shell while previewing presets on the appearance page', function (): void {
    $page = visit('/settings/appearance')->inDarkMode();

    $page->assertScript("getComputedStyle(document.documentElement).getPropertyValue('--sidebar').trim().toUpperCase() === '#17232C'")
        ->assertScript("getComputedStyle(document.documentElement).getPropertyValue('--background').trim().toUpperCase() === '#0E171E'")
        ->assertNoJavaScriptErrors();
});

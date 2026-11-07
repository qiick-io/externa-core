<?php

use App\Enums\FieldTypeEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Required axe smoke for admin key routes (#255).
 * Fail on critical/serious (assertNoAccessibilityIssues level 1).
 * Modes: light, dark, and one high-contrast pass.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

/**
 * Visit with Playwright color-scheme matching the a11y mode so `.dark` / tokens
 * apply on first paint (toggling `.dark` after hydration leaves stale control colors).
 *
 * @param  'light'|'dark'|'high-contrast'  $mode
 */
function visitA11y(string $path, string $mode)
{
    $page = $mode === 'dark'
        ? visit($path)->inDarkMode()
        : visit($path)->inLightMode();

    return applyA11yMode($page, $mode);
}

/**
 * Force theme class + `color-scheme` together after first paint.
 *
 * @param  'light'|'dark'|'high-contrast'  $mode
 */
function applyA11yMode($page, string $mode)
{
    if ($mode === 'light') {
        return $page->assertScript(
            '() => { const root = document.documentElement; root.classList.remove("dark", "high-contrast"); root.style.colorScheme = "light"; return !root.classList.contains("dark") && root.style.colorScheme === "light"; }',
            true,
        );
    }

    if ($mode === 'dark') {
        return $page->assertScript(
            '() => { const root = document.documentElement; root.classList.add("dark"); root.classList.remove("high-contrast"); root.style.colorScheme = "dark"; return root.classList.contains("dark") && root.style.colorScheme === "dark"; }',
            true,
        );
    }

    return $page->assertScript(
        '() => { const root = document.documentElement; root.classList.add("high-contrast"); root.classList.remove("dark"); root.style.colorScheme = "light"; return root.classList.contains("high-contrast") && !root.classList.contains("dark") && root.style.colorScheme === "light"; }',
        true,
    );
}

it('has no critical/serious axe issues on login in light, dark, and high-contrast', function () {
    foreach (['light', 'dark', 'high-contrast'] as $mode) {
        visitA11y('/login', $mode)
            ->assertPresent('#main-content')
            ->assertNoAccessibilityIssues(1)
            ->assertNoJavaScriptErrors();
    }
});

it('has no critical/serious axe issues on key authenticated routes in light and dark', function () {
    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'name' => 'A11y Smoke',
        'slug' => 'a11y-smoke',
        'is_singleton' => false,
    ]);
    CollectionField::factory()->for($collection)->create([
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = $collection->items()->create([]);

    $routes = [
        '/dashboard',
        '/collections',
        route('collections.items.index', $collection, false),
        route('collections.items.show', [$collection, $item], false),
        '/files',
        '/users',
        '/settings/profile',
        '/settings/appearance',
        '/settings/project',
        '/ai',
    ];

    foreach ($routes as $path) {
        foreach (['light', 'dark'] as $mode) {
            visitA11y($path, $mode)
                ->assertPresent('#main-content')
                ->assertNoAccessibilityIssues(1)
                ->assertNoJavaScriptErrors();
        }
    }
});

it('has no critical/serious axe issues on dashboard with high-contrast', function () {
    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    visitA11y('/dashboard', 'high-contrast')
        ->assertPresent('#main-content')
        ->assertNoAccessibilityIssues(1)
        ->assertNoJavaScriptErrors();
});

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
 * @param  'light'|'dark'|'high-contrast'  $mode
 */
function applyA11yMode($page, string $mode)
{
    if ($mode === 'light') {
        return $page;
    }

    if ($mode === 'dark') {
        return $page->assertScript(
            '() => { document.documentElement.classList.add("dark"); document.documentElement.classList.remove("high-contrast"); return document.documentElement.classList.contains("dark"); }',
            true,
        );
    }

    return $page->assertScript(
        '() => { document.documentElement.classList.add("high-contrast"); document.documentElement.classList.remove("dark"); return document.documentElement.classList.contains("high-contrast"); }',
        true,
    );
}

it('has no critical/serious axe issues on login in light, dark, and high-contrast', function () {
    foreach (['light', 'dark', 'high-contrast'] as $mode) {
        $page = visit('/login');
        applyA11yMode($page, $mode)
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
            $page = visit($path);
            applyA11yMode($page, $mode)
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

    $page = visit('/dashboard');
    applyA11yMode($page, 'high-contrast')
        ->assertPresent('#main-content')
        ->assertNoAccessibilityIssues(1)
        ->assertNoJavaScriptErrors();
});

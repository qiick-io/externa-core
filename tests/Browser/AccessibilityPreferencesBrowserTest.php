<?php

use App\Enums\FieldTypeEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
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
        ->assertNoAccessibilityIssues(1)
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

it('has no critical/serious axe issues on login', function () {
    $page = visit('/login');

    $page->assertSee('Skip to content')
        ->assertPresent('#main-content')
        ->assertNoAccessibilityIssues(1)
        ->assertNoJavaScriptErrors();
});

it('shows a visible focus ring when tabbing login in light and dark', function () {
    $hasVisibleFocusRing = <<<'JS'
() => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) {
    return false;
  }
  const style = getComputedStyle(el);
  const shadow = style.boxShadow || '';
  const outline = style.outlineStyle || '';
  const outlineWidth = parseFloat(style.outlineWidth || '0');
  return (shadow !== '' && shadow !== 'none') || (outline !== 'none' && outlineWidth > 0);
}
JS;

    foreach (['light', 'dark'] as $mode) {
        $page = visit('/login');

        if ($mode === 'dark') {
            $page->assertScript(
                '() => { document.documentElement.classList.add("dark"); return document.documentElement.classList.contains("dark"); }',
                true,
            );
        }

        $page->assertSee('Skip to content')
            ->keys('html > body', 'Tab')
            ->wait(0.1)
            ->keys('html > body', 'Tab')
            ->wait(0.1)
            ->assertScript($hasVisibleFocusRing, true)
            ->assertNoAccessibilityIssues(1)
            ->screenshot(false, "a11y-227-login-{$mode}")
            ->assertNoJavaScriptErrors();
    }
});

it('shows a visible focus ring when tabbing the collections list in light and dark', function () {
    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $hasVisibleFocusRing = <<<'JS'
() => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) {
    return false;
  }
  const style = getComputedStyle(el);
  const shadow = style.boxShadow || '';
  const outline = style.outlineStyle || '';
  const outlineWidth = parseFloat(style.outlineWidth || '0');
  return (shadow !== '' && shadow !== 'none') || (outline !== 'none' && outlineWidth > 0);
}
JS;

    foreach (['light', 'dark'] as $mode) {
        $page = visit('/collections');

        if ($mode === 'dark') {
            $page->assertScript(
                '() => { document.documentElement.classList.add("dark"); return document.documentElement.classList.contains("dark"); }',
                true,
            );
        }

        $page->assertPresent('#main-content')
            ->keys('html > body', 'Tab')
            ->wait(0.1)
            ->keys('html > body', 'Tab')
            ->wait(0.1)
            ->assertScript($hasVisibleFocusRing, true)
            ->assertNoAccessibilityIssues(1)
            ->screenshot(false, "a11y-227-collections-{$mode}")
            ->assertNoJavaScriptErrors();
    }
});

it('shows a visible focus ring when tabbing the item form in light and dark', function () {
    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'name' => 'Focus Ring Sink',
        'slug' => 'focus-ring-sink',
        'is_singleton' => false,
    ]);
    CollectionField::factory()->for($collection)->create([
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = $collection->items()->create([]);

    $hasVisibleFocusRing = <<<'JS'
() => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) {
    return false;
  }
  const style = getComputedStyle(el);
  const shadow = style.boxShadow || '';
  const outline = style.outlineStyle || '';
  const outlineWidth = parseFloat(style.outlineWidth || '0');
  return (shadow !== '' && shadow !== 'none') || (outline !== 'none' && outlineWidth > 0);
}
JS;

    foreach (['light', 'dark'] as $mode) {
        $page = visit(route('collections.items.show', [$collection, $item], false));

        if ($mode === 'dark') {
            $page->assertScript(
                '() => { document.documentElement.classList.add("dark"); return document.documentElement.classList.contains("dark"); }',
                true,
            );
        }

        $page->assertPresent('#main-content')
            ->keys('html > body', 'Tab')
            ->wait(0.1)
            ->keys('html > body', 'Tab')
            ->wait(0.1)
            ->assertScript($hasVisibleFocusRing, true)
            ->assertNoAccessibilityIssues(1)
            ->screenshot(false, "a11y-227-item-form-{$mode}")
            ->assertNoJavaScriptErrors();
    }
});

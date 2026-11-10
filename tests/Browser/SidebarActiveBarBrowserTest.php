<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Active sidebar item (#473): like a VS Code tab, the active item has square
 * left corners, rounded right corners and a 3px `sidebar-primary` bar that runs
 * the full height of the item, in the main sidebar and the settings nav.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);
});

/**
 * JS returning the active-bar geometry of every visible active menu button in
 * `selector`: item height, bar height, bar width, the four corner radii and
 * whether the bar colour equals `--sidebar-primary`.
 */
function sidebarActiveBarScript(string $selector): string
{
    $selectorJson = json_encode($selector);

    return <<<JS
(() => {
  const primaryProbe = document.createElement('span');
  primaryProbe.style.color = 'var(--sidebar-primary)';
  document.body.append(primaryProbe);
  const primaryColor = getComputedStyle(primaryProbe).color;
  primaryProbe.remove();

  return [...document.querySelectorAll({$selectorJson})]
    .filter((item) => item.getBoundingClientRect().height > 0)
    .map((item) => {
      const style = getComputedStyle(item);
      const bar = getComputedStyle(item, '::before');

      return {
        label: item.textContent.trim(),
        itemHeight: item.getBoundingClientRect().height,
        barHeight: parseFloat(bar.height),
        barWidth: parseFloat(bar.borderLeftWidth),
        isBarPrimary: bar.borderLeftColor === primaryColor,
        topLeft: style.borderTopLeftRadius,
        bottomLeft: style.borderBottomLeftRadius,
        topRight: style.borderTopRightRadius,
        bottomRight: style.borderBottomRightRadius,
      };
    });
})()
JS;
}

/**
 * @param  list<array<string, mixed>>  $activeItems
 */
function expectFullHeightActiveBars(array $activeItems, string $context): void
{
    expect($activeItems)->not->toBeEmpty("{$context}: no active item");

    foreach ($activeItems as $activeItem) {
        $label = "{$context}: \"{$activeItem['label']}\"";

        expect($activeItem['barHeight'])->toEqual($activeItem['itemHeight'], "{$label} bar height")
            ->and($activeItem['barWidth'])->toEqual(3, "{$label} bar width")
            ->and($activeItem['isBarPrimary'])->toBeTrue("{$label} bar colour")
            ->and($activeItem['topLeft'])->toBe('0px', "{$label} top-left radius")
            ->and($activeItem['bottomLeft'])->toBe('0px', "{$label} bottom-left radius")
            ->and($activeItem['topRight'])->not->toBe('0px', "{$label} top-right radius")
            ->and($activeItem['bottomRight'])->not->toBe('0px', "{$label} bottom-right radius");
    }
}

it('draws a full-height bar with square left corners on the active item', function (string $path, string $theme) {
    $page = visit($path);

    $page->assertNoJavaScriptErrors()
        ->script("document.documentElement.classList.add(...'{$theme}'.split(' ').filter(Boolean))");

    expectFullHeightActiveBars(
        $page->script(sidebarActiveBarScript('[data-sidebar="menu-button"][data-active="true"], [data-sidebar="menu-sub-button"][data-active="true"]')),
        "{$path} ({$theme})",
    );
})->with([
    'main sidebar' => '/dashboard',
    'settings nav' => '/settings/profile',
])->with([
    'light' => '',
    'dark' => 'dark',
    'high contrast' => 'high-contrast',
    'high contrast dark' => 'high-contrast dark',
]);

it('keeps the normal rounding on inactive items', function () {
    $page = visit('/settings/profile');

    $inactiveRadii = $page->script(
        '[...document.querySelectorAll(\'[data-sidebar="menu-button"][data-active="false"]\')].filter((item) => item.getBoundingClientRect().height > 0).map((item) => getComputedStyle(item).borderTopLeftRadius)',
    );

    expect($inactiveRadii)->not->toBeEmpty()
        ->each->not->toBe('0px');
});

it('keeps the full-height bar in the collapsed icon sidebar', function () {
    $page = visit('/dashboard');

    $page->click('[data-sidebar="trigger"]')
        ->wait(0.5)
        ->assertPresent('[data-state="collapsed"][data-collapsible="icon"]');

    expectFullHeightActiveBars(
        $page->script(sidebarActiveBarScript('[data-sidebar="sidebar"] [data-sidebar="menu-button"][data-active="true"]')),
        'collapsed sidebar',
    );
});

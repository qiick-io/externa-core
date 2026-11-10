<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Sidebar "Assistant" item: 1px border in the current theme primary
 * (`--sidebar-primary`, not the violet AI accent), theme accent wash on hover,
 * and the standard full-height active bar with square left corners.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);
});

/**
 * JS returning the Assistant item's border, background and active-bar styles,
 * with the theme tokens resolved to computed colours for comparison.
 */
function sidebarAssistantNavScript(): string
{
    return <<<'JS'
(() => {
  const resolveColor = (token) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${token})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();

    return color;
  };
  const item = [...document.querySelectorAll('.sidebar-ai-nav')].find((element) => element.getBoundingClientRect().height > 0);
  const style = getComputedStyle(item);
  const bar = getComputedStyle(item, '::before');

  return {
    primary: resolveColor('--sidebar-primary'),
    accent: resolveColor('--sidebar-accent'),
    ai: resolveColor('--ai'),
    outlineColor: style.outlineColor,
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    outlineOffset: style.outlineOffset,
    background: style.backgroundColor,
    isActive: item.dataset.active === 'true',
    itemHeight: item.getBoundingClientRect().height,
    barHeight: parseFloat(bar.height),
    barColor: bar.borderLeftColor,
    topLeft: style.borderTopLeftRadius,
    topRight: style.borderTopRightRadius,
    shimmerAnimation: getComputedStyle(item, '::after').animationName,
  };
})()
JS;
}

it('borders the Assistant item in the theme primary, not the AI violet', function (string $path, string $theme) {
    $page = visit($path);

    $page->assertNoJavaScriptErrors()
        ->script("document.documentElement.classList.add(...'{$theme}'.split(' ').filter(Boolean))");

    $nav = $page->script(sidebarAssistantNavScript());

    expect($nav['outlineStyle'])->toBe('solid')
        ->and($nav['outlineWidth'])->toBe('1px')
        ->and($nav['outlineOffset'])->toBe('-1px')
        ->and($nav['outlineColor'])->toBe($nav['primary'])
        ->and($nav['outlineColor'])->not->toBe($nav['ai']);

    if ($path === '/ai') {
        expect($nav['isActive'])->toBeTrue()
            ->and($nav['barHeight'])->toEqual($nav['itemHeight'])
            ->and($nav['barColor'])->toBe($nav['primary'])
            ->and($nav['topLeft'])->toBe('0px')
            ->and($nav['topRight'])->not->toBe('0px');
    }
})->with([
    'inactive' => '/dashboard',
    'active' => '/ai',
])->with([
    'light' => '',
    'dark' => 'dark',
    'high contrast' => 'high-contrast',
    'high contrast dark' => 'high-contrast dark',
]);

it('follows the theme preset primary', function () {
    $page = visit('/dashboard');

    // Theme presets (#243) write `--sidebar-primary` on :root; use the rose preset value.
    $page->script("document.documentElement.style.setProperty('--sidebar-primary', '#AF3774')");

    expect($page->script(sidebarAssistantNavScript())['outlineColor'])->toBe('rgb(175, 55, 116)');
});

it('washes the Assistant item in the theme accent on hover', function () {
    $page = visit('/dashboard');

    $page->hover('.sidebar-ai-nav')->wait(0.2);

    $nav = $page->script(sidebarAssistantNavScript());

    expect($nav['background'])->toBe($nav['accent'])
        ->and($nav['shimmerAnimation'])->toBe('sidebar-ai-shimmer');
});

it('drops the hover shimmer when reduced motion is on', function () {
    $page = visit('/dashboard');

    $page->script("document.documentElement.classList.add('reduce-motion')");
    $page->hover('.sidebar-ai-nav')->wait(0.2);

    expect($page->script(sidebarAssistantNavScript())['shimmerAnimation'])->toBe('none');
});

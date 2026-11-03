<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * The activity log filters by date with one from–to field on the shadcn
 * Calendar (two months side by side), not two native date inputs.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $admin = User::factory()->create();
    $admin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($admin);
});

it('picks a date range in either order and clears it', function (): void {
    $page = visit('/activity-logs');

    $page->assertMissing('input[type="date"]')
        ->click('[data-test="activity-log-date-range"]')
        ->wait(0.3)
        ->assertScript(<<<'JS'
(() => {
  const months = [...document.querySelectorAll('[data-slot="calendar"] .rdp-month')];

  return months.length === 2 && Math.round(months[0].getBoundingClientRect().top) === Math.round(months[1].getBoundingClientRect().top);
})()
JS);

    $page->script(<<<'JS'
(async () => {
  const day = (label) => [...document.querySelectorAll('[data-slot="calendar"] .rdp-month:first-of-type button[data-day]')]
    .find((button) => button.textContent.trim() === label && !button.closest('.rdp-outside'));

  day('12').click();
  await new Promise((resolve) => setTimeout(resolve, 200));
  day('3').click();
})()
JS);

    $page->wait(1)
        ->assertQueryStringHas('date_from')
        ->assertQueryStringHas('date_to')
        ->assertScript("new URLSearchParams(location.search).get('date_from').endsWith('-03') && new URLSearchParams(location.search).get('date_to').endsWith('-12')")
        ->assertMissing('[data-slot="calendar"]')
        ->click('[data-test="activity-log-date-range"]')
        ->wait(0.3)
        ->click('[data-test="activity-log-date-range-clear"]')
        ->wait(1)
        ->assertQueryStringMissing('date_from')
        ->assertQueryStringMissing('date_to')
        ->assertNoJavaScriptErrors();
});

it('previews the range band on hover and tints the days between the ends', function (): void {
    $start = now()->startOfMonth()->addDays(2);
    $hovered = now()->startOfMonth()->addDays(9);

    $page = visit('/activity-logs');

    $page->click('[data-test="activity-log-date-range"]')
        ->wait(0.3)
        ->click('button[data-day="'.$start->format('n/j/Y').'"]')
        ->wait(0.3);

    $page->hover('button[data-day="'.$hovered->format('n/j/Y').'"]')
        ->wait(0.2)
        ->assertScript("document.querySelectorAll('[data-slot=\"calendar\"] td.rdp-range_middle').length === 6")
        ->assertScript(<<<'JS'
(() => {
  const middle = document.querySelector('[data-slot="calendar"] td.rdp-range_middle');
  const background = getComputedStyle(middle).backgroundColor;
  const popover = getComputedStyle(middle.closest('[data-slot="popover-content"]')).backgroundColor;

  return background !== 'rgba(0, 0, 0, 0)' && background !== popover;
})()
JS)
        ->click('button[data-day="'.$hovered->format('n/j/Y').'"]')
        ->wait(1)
        ->assertQueryStringHas('date_from', $start->format('Y-m-d'))
        ->assertQueryStringHas('date_to', $hovered->format('Y-m-d'))
        ->assertNoJavaScriptErrors();
});

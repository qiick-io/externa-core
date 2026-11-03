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

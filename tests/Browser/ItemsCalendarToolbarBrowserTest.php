<?php

use App\Enums\FieldTypeEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * The calendar view switcher is a single-choice ToggleGroup: picking a view
 * switches the calendar, picking the active one again keeps it.
 */
it('switches calendar views from the toggle group', function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $collection = Collection::factory()->create(['name' => 'Events', 'slug' => 'events']);
    CollectionField::factory()->for($collection)->create(['name' => 'when', 'type' => FieldTypeEnum::Date]);

    visit(route('collections.items.index', $collection, false).'?layout=calendar&calendar_field=when')
        ->assertAttribute('[data-test="items-calendar"]', 'data-view', 'month')
        ->click('[data-test="calendar-view-week"]')
        ->assertAttribute('[data-test="items-calendar"]', 'data-view', 'week')
        ->assertAttribute('[data-test="calendar-view-week"]', 'aria-checked', 'true')
        ->click('[data-test="calendar-view-week"]')
        ->assertAttribute('[data-test="items-calendar"]', 'data-view', 'week')
        ->assertNoJavaScriptErrors();
});

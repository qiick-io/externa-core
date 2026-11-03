<?php

use App\Enums\FieldTypeEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Item edit page: the activity view keeps the sub-header layout, hides the
 * publish schedule panel and survives pagination and history (#465).
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $this->collection = Collection::factory()->create([
        'name' => 'Activity Posts',
        'slug' => 'activity-posts',
        'is_singleton' => false,
        'versioning' => true,
    ]);
    CollectionField::factory()->for($this->collection)->create([
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $this->item = $this->collection->items()->create([]);
});

function itemActivityViewEditUrl(Collection $collection, CollectionItem $item): string
{
    return route('collections.items.show', [$collection, $item], false);
}

it('keeps the sub-header controls in place when switching to the activity view', function () {
    $activityToggleLeft = 'document.querySelector(\'[aria-label="Activity"]\').getBoundingClientRect().left';

    $page = visit(itemActivityViewEditUrl($this->collection, $this->item));

    $page->assertNoJavaScriptErrors();
    $leftInEditView = $page->script($activityToggleLeft);

    $page->click('[aria-label="Activity"]')
        ->wait(0.4)
        ->assertQueryStringHas('view', 'activity')
        ->assertSee('Created by');

    expect($page->script($activityToggleLeft))->toEqual($leftInEditView);
});

it('renders the icon-only view toggles as square controls', function () {
    $page = visit(itemActivityViewEditUrl($this->collection, $this->item));

    $toggleSizes = $page->script(
        '[...document.querySelectorAll(\'[data-slot="toggle-group-item"]\')].map((toggle) => { const box = toggle.getBoundingClientRect(); return [box.width, box.height]; })',
    );

    expect($toggleSizes)->toHaveCount(2);

    foreach ($toggleSizes as [$width, $height]) {
        expect($width)->toEqual($height);
    }
});

it('shows the publish schedule panel only in the edit view', function () {
    $page = visit(itemActivityViewEditUrl($this->collection, $this->item));

    $page->assertNoJavaScriptErrors()
        ->assertPresent('[data-test="item-schedule-panel"]')
        ->click('[aria-label="Activity"]')
        ->wait(0.4)
        ->assertNotPresent('[data-test="item-schedule-panel"]')
        ->click('[aria-label="Fields"]')
        ->wait(0.4)
        ->assertQueryStringMissing('view')
        ->assertPresent('[data-test="item-schedule-panel"]')
        ->assertNoJavaScriptErrors();
});

it('keeps the activity view across pagination, back and forward', function () {
    foreach (range(1, 15) as $index) {
        activity()
            ->performedOn($this->item)
            ->event('updated')
            ->log("Item activity entry {$index}");
    }

    $page = visit(itemActivityViewEditUrl($this->collection, $this->item));

    $page->assertNoJavaScriptErrors()
        ->click('[aria-label="Activity"]')
        ->wait(0.4)
        ->assertSee('Item activity entry 13')
        ->click('button[aria-label="Go to page 2"]')
        ->wait(1)
        ->assertQueryStringHas('page', '2')
        ->assertQueryStringHas('view', 'activity')
        ->assertSee('Item activity entry 3')
        ->assertNotPresent('[data-test="item-schedule-panel"]')
        ->back()
        ->wait(0.6)
        ->assertQueryStringHas('view', 'activity')
        ->assertSee('Item activity entry 13')
        ->back()
        ->wait(0.6)
        ->assertQueryStringMissing('view')
        ->assertPresent('[data-test="item-schedule-panel"]')
        ->forward()
        ->wait(0.6)
        ->assertQueryStringHas('view', 'activity')
        ->assertSee('Item activity entry 13')
        ->assertNoJavaScriptErrors();
});

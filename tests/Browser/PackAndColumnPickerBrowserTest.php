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
 * Starter packs are a RadioGroup of choice cards; the list column picker is
 * a Command list (search, toggle, drill into related fields).
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);
});

it('chooses a collection pack as a radio option', function (): void {
    visit('/collections')
        ->click('button[aria-label="Create from pack…"]')
        ->assertAttribute('#collection-pack-seo', 'aria-checked', 'true')
        ->click('#collection-pack-categories')
        ->assertAttribute('#collection-pack-categories', 'aria-checked', 'true')
        ->assertAttribute('#collection-pack-seo', 'aria-checked', 'false')
        ->assertNoJavaScriptErrors();
});

it('searches and toggles a list column from the column picker', function (): void {
    $collection = Collection::factory()->create(['name' => 'Columns', 'slug' => 'columns', 'versioning' => false]);
    CollectionField::factory()->for($collection)->create(['name' => 'title', 'type' => FieldTypeEnum::String]);
    CollectionItem::factory()->create(['collection_id' => $collection->id]);

    visit(route('collections.items.index', $collection, false))
        ->click('button[aria-label="Configure columns"]')
        ->type('[cmdk-input]', 'updated at')
        ->assertSee('Updated at')
        ->assertMissing('[cmdk-item][data-value="title"]')
        ->click('[cmdk-item][data-value="updated_at"]')
        ->assertVisible('[cmdk-item][data-value="updated_at"] svg.ml-auto:not(.opacity-0)')
        ->type('[cmdk-input]', 'zzz')
        ->assertSee('No fields match your search.')
        ->assertNoJavaScriptErrors();
});

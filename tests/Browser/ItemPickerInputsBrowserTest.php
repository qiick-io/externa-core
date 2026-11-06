<?php

use App\Enums\FieldTypeEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Collections\CollectionItemValuesAssemblerService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * The free-text and option pickers of the item form on Popover + Command:
 * keyboard picks a suggestion, free text is still submitted, chips stay.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $this->collection = Collection::factory()->create([
        'name' => 'Picker Posts',
        'slug' => 'picker-posts',
        'is_singleton' => false,
        'versioning' => false,
    ]);

    foreach ([
        ['city', FieldTypeEnum::Autocomplete, ['options' => [['value' => 'Rome', 'label' => 'Rome'], ['value' => 'Milan', 'label' => 'Milan']]]],
        ['region', FieldTypeEnum::Autocomplete, ['allow_other' => true, 'options' => [['value' => 'Lazio', 'label' => 'Lazio']]]],
        ['topics', FieldTypeEnum::Tag, ['presets' => ['alpha', 'beta']]],
        ['colors', FieldTypeEnum::Multiselect, ['options' => [['value' => 'red', 'label' => 'Red'], ['value' => 'green', 'label' => 'Green']]]],
    ] as [$name, $type, $settings]) {
        CollectionField::factory()->for($this->collection)->create(['name' => $name, 'type' => $type, 'settings' => $settings]);
    }
});

it('picks suggestions with the keyboard and keeps free text', function (): void {
    $page = visit(route('collections.items.new', $this->collection, false));

    $page->type('#data_city', 'Mi')
        ->assertSee('Milan')
        ->keys('#data_city', ['ArrowDown', 'Enter'])
        ->assertValue('#data_city', 'Milan')
        ->type('#data_region', 'Umbria')
        ->keys('#data_region', 'Escape')
        ->assertValue('#data_region', 'Umbria')
        ->type('input[placeholder="Add tag…"]', 'be')
        ->keys('input[placeholder="Add tag…"]', ['ArrowDown', 'Enter'])
        ->type('input[placeholder="Add tag…"]', 'custom')
        ->keys('input[placeholder="Add tag…"]', 'Enter')
        ->click('Select options…')
        ->type('[cmdk-input]', 'gre')
        ->keys('[cmdk-input]', ['Enter', 'Escape'])
        ->assertSee('Green')
        ->click('[data-test="item-save-split"] button[type="submit"]')
        ->wait(1.5)
        ->assertNoJavaScriptErrors();

    $item = CollectionItem::query()->where('collection_id', $this->collection->id)->sole();

    expect(app(CollectionItemValuesAssemblerService::class)->assemble($item))->toMatchArray([
        'city' => 'Milan',
        'region' => 'Umbria',
        'topics' => ['beta', 'custom'],
        'colors' => ['green'],
    ]);
});

it('searches the field types and opens one with the keyboard', function (): void {
    visit(route('collections.fields.index', $this->collection, false))
        ->click('Add field')
        ->type('[cmdk-input]', 'markdown')
        ->keys('[cmdk-input]', 'Enter')
        ->wait(0.5)
        ->assertPresent('form input[name="name"]')
        ->assertNoJavaScriptErrors();
});

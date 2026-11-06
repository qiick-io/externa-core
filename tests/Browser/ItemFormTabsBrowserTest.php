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
 * Tabs and accordions of the item form keep every field mounted: edits on a
 * tab survive a tab switch, and fields on hidden tabs or collapsed sections
 * are saved.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);
});

/**
 * @param  array<int, array{0: string, 1: FieldTypeEnum, 2: array<string, mixed>|null}>  $definitions
 */
function createTabsCollection(string $slug, array $definitions): Collection
{
    $collection = Collection::factory()->create(['name' => ucfirst($slug), 'slug' => $slug, 'versioning' => false]);

    foreach ($definitions as $sort => [$name, $type, $settings]) {
        CollectionField::factory()->for($collection)->create([
            'name' => $name,
            'type' => $type,
            'settings' => $settings,
            'sort_order' => $sort,
        ]);
    }

    return $collection;
}

it('keeps form-layout tab edits across tab switches and saves every tab', function (): void {
    $collection = createTabsCollection('layout-tabs', [
        ['title', FieldTypeEnum::String, null],
        ['subtitle', FieldTypeEnum::String, null],
    ]);
    [$title, $subtitle] = $collection->fields()->orderBy('sort_order')->get()->all();
    $collection->update(['form_layout' => [
        'version' => 1,
        'tabs' => [['id' => 'main', 'label' => ['en' => 'Main']], ['id' => 'extra', 'label' => ['en' => 'Extra']]],
        'sections' => [
            ['id' => 's1', 'tab_id' => 'main', 'label' => ['en' => 'First'], 'collapsible' => false, 'collapsed' => false, 'field_ids' => [$title->id]],
            ['id' => 's2', 'tab_id' => 'extra', 'label' => ['en' => 'Second'], 'collapsible' => true, 'collapsed' => true, 'field_ids' => [$subtitle->id]],
        ],
    ]]);

    visit(route('collections.items.new', $collection, false))
        ->fill('#data_title', 'Kept title')
        ->click('[role="tab"]:has-text("Extra")')
        ->click('Second')
        ->fill('#data_subtitle', 'Kept subtitle')
        ->click('[role="tab"]:has-text("Main")')
        ->assertValue('#data_title', 'Kept title')
        ->click('[data-test="item-save-split"] button[type="submit"]')
        ->wait(1.5)
        ->assertNoJavaScriptErrors();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->sole();

    expect(app(CollectionItemValuesAssemblerService::class)->assemble($item))
        ->toMatchArray(['title' => 'Kept title', 'subtitle' => 'Kept subtitle']);
});

it('saves fields on hidden group tabs and in collapsed accordion sections', function (): void {
    $collection = createTabsCollection('group-tabs', [
        ['tabs', FieldTypeEnum::GroupTabs, null],
        ['tab_a', FieldTypeEnum::GroupRaw, ['group' => 'tabs', 'name' => ['en' => 'Tab A']]],
        ['alpha', FieldTypeEnum::String, ['group' => 'tab_a']],
        ['tab_b', FieldTypeEnum::GroupRaw, ['group' => 'tabs', 'name' => ['en' => 'Tab B']]],
        ['beta', FieldTypeEnum::String, ['group' => 'tab_b']],
        ['sections', FieldTypeEnum::GroupAccordion, ['start' => 'first']],
        ['sec_a', FieldTypeEnum::GroupRaw, ['group' => 'sections', 'name' => ['en' => 'Section A']]],
        ['gamma', FieldTypeEnum::String, ['group' => 'sec_a']],
        ['sec_b', FieldTypeEnum::GroupRaw, ['group' => 'sections', 'name' => ['en' => 'Section B']]],
        ['delta', FieldTypeEnum::String, ['group' => 'sec_b']],
    ]);

    visit(route('collections.items.new', $collection, false))
        ->fill('#data_alpha', 'A')
        ->click('[data-tab-name="tab_b"]')
        ->fill('#data_beta', 'B')
        ->click('[data-tab-name="tab_a"]')
        ->fill('#data_gamma', 'G')
        ->click('[data-accordion-section="sec_b"]')
        ->fill('#data_delta', 'D')
        ->click('[data-accordion-section="sec_b"]')
        ->assertAttribute('[data-accordion-section="sec_b"]', 'aria-expanded', 'false')
        ->click('[data-test="item-save-split"] button[type="submit"]')
        ->wait(1.5)
        ->assertNoJavaScriptErrors();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->sole();

    expect(app(CollectionItemValuesAssemblerService::class)->assemble($item))
        ->toMatchArray(['alpha' => 'A', 'beta' => 'B', 'gamma' => 'G', 'delta' => 'D']);
});

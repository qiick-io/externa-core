<?php

use App\Enums\CollectionPermissionAction;
use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemValue;
use App\Models\User;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\MigrateFormLayoutToGroupsService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->withoutVite();
});

test('layout group fields can be created and force full width', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $response = $this->post(route('collections.fields.store', $collection), [
        'name' => 'main_tabs',
        'type' => FieldTypeEnum::GroupTabs->value,
        'translatable' => true,
        'settings' => [
            'layout_width' => 'half',
            'display_name' => ['en' => 'Main'],
            'fill_width' => '1',
        ],
    ]);

    $response->assertRedirect()->assertSessionHasNoErrors();

    $field = CollectionField::query()->where('collection_id', $collection->id)->where('name', 'main_tabs')->first();
    expect($field)->not->toBeNull()
        ->and($field->type)->toBe(FieldTypeEnum::GroupTabs)
        ->and($field->translatable)->toBeFalse()
        ->and($field->settings['layout_width'] ?? null)->toBe('full')
        ->and($field->layoutWidth())->toBe('full')
        ->and($field->settings['fill_width'] ?? null)->toBeTrue();
});

test('accordion group defaults to max-one-open and coerces opened start', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'acc',
        'type' => FieldTypeEnum::GroupAccordion->value,
        'settings' => [
            'accordion_mode' => '1',
            'start' => 'opened',
            'layout_width' => 'full',
        ],
    ])->assertRedirect()->assertSessionHasNoErrors();

    $field = CollectionField::query()->where('collection_id', $collection->id)->where('name', 'acc')->first();
    expect($field)->not->toBeNull()
        ->and($field->settings['accordion_mode'] ?? null)->toBeTrue()
        ->and($field->settings['start'] ?? null)->toBe('closed');

    $sections = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('type', FieldTypeEnum::GroupRaw)
        ->get()
        ->filter(fn (CollectionField $f) => ($f->settings['group'] ?? null) === 'acc');
    expect($sections)->toHaveCount(2);
});

test('accordion accepts nested raw section via field store', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'acc',
        'type' => FieldTypeEnum::GroupAccordion,
        'settings' => ['layout_width' => 'full'],
        'sort_order' => 1,
    ]);

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'acc_section_3',
        'type' => FieldTypeEnum::GroupRaw->value,
        'translatable' => false,
        'settings' => [
            'layout_width' => 'full',
            'group' => 'acc',
            'display_name' => ['en' => 'Section 3'],
        ],
    ])->assertRedirect()->assertSessionHasNoErrors();

    $section = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'acc_section_3')
        ->first();

    expect($section)->not->toBeNull()
        ->and($section->type)->toBe(FieldTypeEnum::GroupRaw)
        ->and($section->settings['group'] ?? null)->toBe('acc')
        ->and($section->settings['display_name']['en'] ?? null)->toBe('Section 3');
});

test('nesting via settings.group validates parent and reorder nests leaf under accordion directly', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $accordion = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'acc',
        'type' => FieldTypeEnum::GroupAccordion,
        'settings' => ['layout_width' => 'full'],
        'sort_order' => 1,
    ]);
    $title = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'sort_order' => 2,
    ]);

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'subtitle',
        'type' => FieldTypeEnum::String->value,
        'settings' => ['group' => 'missing_parent'],
    ])->assertSessionHasErrors('settings.group');

    $this->post(route('collections.fields.reorder', $collection), [
        'ids' => [$accordion->id, $title->id],
        'starts_new_row_ids' => [],
        'groups' => [
            (string) $title->id => 'acc',
            (string) $accordion->id => null,
        ],
    ])->assertRedirect()->assertSessionHasNoErrors();

    // Directus parity: leaf→Accordion nests directly (no Raw auto-wrap).
    expect($title->fresh()->settings['group'] ?? null)->toBe('acc');
});

test('accordion and tabs accept any layout group children (Directus parity)', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'acc',
        'type' => FieldTypeEnum::GroupAccordion,
        'settings' => ['layout_width' => 'full'],
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'tabs',
        'type' => FieldTypeEnum::GroupTabs,
        'settings' => ['layout_width' => 'full'],
        'sort_order' => 2,
    ]);

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'nested_tabs',
        'type' => FieldTypeEnum::GroupTabs->value,
        'settings' => [
            'layout_width' => 'full',
            'group' => 'acc',
        ],
    ])->assertRedirect()->assertSessionHasNoErrors();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'nested_detail',
        'type' => FieldTypeEnum::GroupDetail->value,
        'settings' => [
            'layout_width' => 'full',
            'group' => 'tabs',
        ],
    ])->assertRedirect()->assertSessionHasNoErrors();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'nested_raw',
        'type' => FieldTypeEnum::GroupRaw->value,
        'settings' => [
            'layout_width' => 'full',
            'group' => 'acc',
            'display_name' => ['en' => 'OK'],
        ],
    ])->assertRedirect()->assertSessionHasNoErrors();

    $nestedTabs = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'nested_tabs')
        ->first();
    $nestedDetail = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'nested_detail')
        ->first();

    expect($nestedTabs)->not->toBeNull()
        ->and($nestedTabs->settings['group'] ?? null)->toBe('acc');
    expect($nestedDetail)->not->toBeNull()
        ->and($nestedDetail->settings['group'] ?? null)->toBe('tabs');
});

test('dropping a group onto accordion nests it as a section without wrap', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $accordion = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'acc',
        'type' => FieldTypeEnum::GroupAccordion,
        'settings' => ['layout_width' => 'full'],
        'sort_order' => 1,
    ]);
    $raw = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'panel',
        'type' => FieldTypeEnum::GroupRaw,
        'settings' => ['layout_width' => 'full'],
        'sort_order' => 2,
    ]);

    $this->post(route('collections.fields.reorder', $collection), [
        'ids' => [$accordion->id, $raw->id],
        'starts_new_row_ids' => [],
        'groups' => [
            (string) $raw->id => 'acc',
            (string) $accordion->id => null,
        ],
    ])->assertRedirect()->assertSessionHasNoErrors();

    expect($raw->fresh()->settings['group'] ?? null)->toBe('acc');
    expect(
        CollectionField::query()
            ->where('collection_id', $collection->id)
            ->where('type', FieldTypeEnum::GroupRaw)
            ->where('id', '!=', $raw->id)
            ->count()
    )->toBe(0);
});

test('tabs create seeds default panel sections', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'main_tabs',
        'type' => FieldTypeEnum::GroupTabs->value,
        'settings' => ['layout_width' => 'full'],
    ])->assertRedirect()->assertSessionHasNoErrors();

    $panels = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('type', FieldTypeEnum::GroupRaw)
        ->get()
        ->filter(fn (CollectionField $f) => ($f->settings['group'] ?? null) === 'main_tabs');
    expect($panels)->toHaveCount(2);
});

test('deleting a group ungroups children', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $detail = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'details',
        'type' => FieldTypeEnum::GroupDetail,
        'settings' => ['layout_width' => 'full', 'start' => 'open'],
    ]);
    $title = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'settings' => ['group' => 'details'],
    ]);

    $this->delete(route('collections.fields.destroy', [$collection, $detail]))
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    expect(CollectionField::query()->find($detail->id))->toBeNull()
        ->and($title->fresh()->settings['group'] ?? null)->toBeNull();
});

test('item save does not store values for layout groups', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'wrap',
        'type' => FieldTypeEnum::GroupRaw,
        'settings' => ['layout_width' => 'full'],
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'settings' => ['group' => 'wrap'],
    ]);

    $response = $this->post(route('collections.items.store', $collection), [
        'data' => [
            'wrap' => 'should-be-ignored',
            'title' => 'Hello',
        ],
    ]);

    $response->assertRedirect()->assertSessionHasNoErrors();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->first();
    expect($item)->not->toBeNull();

    $wrapField = CollectionField::query()->where('collection_id', $collection->id)->where('name', 'wrap')->first();
    expect(CollectionItemValue::query()->where('item_id', $item->id)->where('field_id', $wrapField->id)->count())->toBe(0);

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item);
    expect($assembled)->toHaveKey('title')
        ->and($assembled)->not->toHaveKey('wrap');
});

test('public collection schema omits layout group fields', function () {
    $collection = Collection::factory()->create(['slug' => 'groups-public-test']);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'layout_tabs',
        'type' => FieldTypeEnum::GroupTabs,
        'settings' => ['layout_width' => 'full'],
    ]);

    grantPublicActions($collection, [CollectionPermissionAction::Read]);

    $response = $this->getJson('/api/v1/collections/'.$collection->slug);
    $response->assertOk();
    $names = collect($response->json('data.fields'))->pluck('name')->all();
    expect($names)->toContain('title')
        ->and($names)->not->toContain('layout_tabs');
});

test('migrate form_layout creates groups and clears layout', function () {
    $collection = Collection::factory()->create();
    $title = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $status = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'type' => FieldTypeEnum::Select,
    ]);

    $collection->update([
        'form_layout' => [
            'version' => 1,
            'tabs' => [
                ['id' => 'main', 'label' => ['en' => 'Main']],
            ],
            'sections' => [
                [
                    'id' => 'details',
                    'tab_id' => 'main',
                    'label' => ['en' => 'Details'],
                    'collapsible' => true,
                    'collapsed' => false,
                    'field_ids' => [$title->id, $status->id],
                ],
            ],
        ],
    ]);

    $created = app(MigrateFormLayoutToGroupsService::class)->migrateCollection($collection->fresh());

    expect($created)->toBeGreaterThan(0);

    $collection->refresh();
    expect($collection->form_layout)->toBeNull();

    $tabs = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('type', FieldTypeEnum::GroupTabs)
        ->first();
    expect($tabs)->not->toBeNull();

    expect($title->fresh()->settings['group'] ?? null)->not->toBeNull()
        ->and($status->fresh()->settings['group'] ?? null)->toBe($title->fresh()->settings['group']);
});

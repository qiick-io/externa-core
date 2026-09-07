<?php

use App\Enums\FieldTypeEnum;
use Database\Seeders\PermissionSeeder;
use Tests\Support\FieldSettingsTestHelpers as H;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('hash masked persists; empty value auto-generates fingerprint', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'token', FieldTypeEnum::Hash);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'masked' => '1',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'masked' => true,
    ]);

    H::storeItem($this, $collection, ['token' => ''])->assertRedirect();
    $value = H::assemble(H::latestItem($collection))['token'] ?? null;
    expect($value)->toBeString()->and(strlen((string) $value))->toBeGreaterThan(10);
});

test('slider min max step default_value show_value persist and bounds enforce', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'volume', FieldTypeEnum::Slider);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'min' => 0,
        'max' => 10,
        'step' => 1,
        'default_value' => 4,
        'show_value' => '1',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'min' => 0,
        'max' => 10,
        'step' => 1,
        'default_value' => 4,
        'show_value' => true,
    ]);

    H::storeItem($this, $collection, ['volume' => 11])->assertSessionHasErrors('data.volume');
    H::storeItem($this, $collection, ['volume' => -1])->assertSessionHasErrors('data.volume');
    H::storeItem($this, $collection, [])->assertRedirect()->assertSessionHasNoErrors();
    expect(H::assemble(H::latestItem($collection))['volume'])->toBe(4);
});

test('group_accordion accordion_mode start persist and coerce opened when accordion on', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'acc', FieldTypeEnum::GroupAccordion, [
        'layout_width' => 'full',
    ]);

    $fresh = H::assertSettingsRoundtrip($this, $collection, $field, [
        'accordion_mode' => '1',
        'start' => 'opened',
        'layout_width' => 'full',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
    ], [
        'accordion_mode' => true,
        'start' => 'closed',
        'layout_width' => 'full',
    ]);

    expect($fresh->layoutWidth())->toBe('full');
});

test('group_accordion start first persists when accordion mode on', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'acc2', FieldTypeEnum::GroupAccordion, [
        'layout_width' => 'full',
    ]);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'accordion_mode' => '1',
        'start' => 'first',
        'layout_width' => 'full',
    ], [
        'start' => 'first',
        'accordion_mode' => true,
    ]);
});

test('group_detail start open closed persist', function (string $start) {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'detail_'.$start, FieldTypeEnum::GroupDetail);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'start' => $start,
        'layout_width' => 'half',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
    ], [
        'start' => $start,
        'layout_width' => 'full',
    ]);
})->with(['open', 'closed']);

test('group_accordion start opened persists when accordion mode off', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'acc_open', FieldTypeEnum::GroupAccordion, [
        'layout_width' => 'full',
    ]);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'accordion_mode' => '0',
        'start' => 'opened',
        'layout_width' => 'full',
    ], [
        'accordion_mode' => false,
        'start' => 'opened',
    ]);
});

test('group_tabs fill_width persists and forces full layout width', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'tabs', FieldTypeEnum::GroupTabs);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'fill_width' => '1',
        'layout_width' => 'half',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
    ], [
        'fill_width' => true,
        'layout_width' => 'full',
    ]);
});

test('group_raw forces full width; group nesting key persists on child', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $raw = H::makeField($collection, 'section', FieldTypeEnum::GroupRaw, [
        'layout_width' => 'full',
    ]);
    $child = H::makeField($collection, 'title', FieldTypeEnum::String);

    H::assertSettingsRoundtrip($this, $collection, $raw, [
        'layout_width' => 'half',
    ], [
        'layout_width' => 'full',
    ]);

    H::assertSettingsRoundtrip($this, $collection, $child, [
        'group' => 'section',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'group' => 'section',
    ]);
});

test('items_shown persists when provided (UI-only catalog key)', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'picker', FieldTypeEnum::ManyToOne);
    $related = H::makeCollection();

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'related_collection_id' => $related->id,
        'display_field' => 'title',
        'items_shown' => 25,
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'items_shown' => 25,
        'related_collection_id' => $related->id,
    ]);
});

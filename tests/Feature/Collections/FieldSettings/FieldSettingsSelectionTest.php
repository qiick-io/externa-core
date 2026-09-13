<?php

use App\Enums\FieldTypeEnum;
use App\Support\Collections\MapGeometry;
use Database\Seeders\PermissionSeeder;
use Tests\Support\FieldSettingsTestHelpers as H;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('boolean label_on label_off persist', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'active', FieldTypeEnum::Boolean);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'label_on' => ['en' => 'Yes'],
        'label_off' => ['en' => 'No'],
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'label_on' => ['en' => 'Yes'],
        'label_off' => ['en' => 'No'],
    ]);
});

test('date date_mode and include_seconds persist; date mode accepts date-only', function (string $mode) {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'when_'.$mode, FieldTypeEnum::Date);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'date_mode' => $mode,
        'include_seconds' => '1',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'date_mode' => $mode,
        'include_seconds' => true,
    ]);

    $value = match ($mode) {
        'date' => '2026-07-23',
        'time' => '14:30',
        default => '2026-07-23T14:30',
    };

    H::storeItem($this, $collection, ['when_'.$mode => $value])->assertRedirect()->assertSessionHasNoErrors();
})->with(['date', 'time', 'datetime']);

test('map geometry and defaults persist; multipoint mode accepted', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'location', FieldTypeEnum::Map);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'geometry_mode' => 'multipoint',
        'default_lat' => 45.46,
        'default_lng' => 9.19,
        'default_zoom' => 12,
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'geometry_mode' => 'multipoint',
        'default_lat' => 45.46,
        'default_lng' => 9.19,
        'default_zoom' => 12,
    ]);

    expect(MapGeometry::normalizeMode(data_get($field->fresh()->settings, 'geometry_mode')))->toBe('multipoint');

    H::storeItem($this, $collection, [
        'location' => [
            'type' => 'MultiPoint',
            'coordinates' => [[9.19, 45.46], [9.2, 45.5]],
        ],
    ])->assertRedirect()->assertSessionHasNoErrors();
});

test('map geometry_mode point accepts Point payload', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'location', FieldTypeEnum::Map);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'geometry_mode' => 'point',
        'default_lat' => 41.9,
        'default_lng' => 12.5,
        'default_zoom' => 10,
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'geometry_mode' => 'point',
    ]);

    H::storeItem($this, $collection, [
        'location' => [
            'type' => 'Point',
            'coordinates' => [12.5, 41.9],
        ],
    ])->assertRedirect()->assertSessionHasNoErrors();
});

test('select allow_none empty store when optional', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    H::makeField($collection, 'status', FieldTypeEnum::Select, [
        'allow_none' => true,
        'allow_other' => false,
        'options' => [
            ['value' => 'draft', 'label' => 'Draft'],
        ],
    ]);

    H::storeItem($this, $collection, [])->assertRedirect()->assertSessionHasNoErrors();
});

test('color opacity and preset_colors persist', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'brand', FieldTypeEnum::Color);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'opacity' => '1',
        'preset_colors' => '#ff0000, #00ff00',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'opacity' => true,
    ]);

    expect($field->fresh()->settings)->toHaveKey('preset_colors');
});

test('select allow_none allow_other options persist; allow_other gates unknown values', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'status', FieldTypeEnum::Select);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'allow_none' => '1',
        'allow_other' => '0',
        'options' => [
            ['value' => 'draft', 'label' => 'Draft'],
            ['value' => 'live', 'label' => 'Live'],
        ],
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'allow_none' => true,
        'allow_other' => false,
        'options' => [
            ['value' => 'draft', 'label' => 'Draft'],
            ['value' => 'live', 'label' => 'Live'],
        ],
    ]);

    H::storeItem($this, $collection, ['status' => 'nope'])->assertSessionHasErrors('data.status');
    H::storeItem($this, $collection, ['status' => 'draft'])->assertRedirect();

    // allow_none is UI clear-control; empty optional select still stores ok.
    H::storeItem($this, $collection, [])->assertRedirect()->assertSessionHasNoErrors();
});

test('select allow_other accepts custom values', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    H::makeField($collection, 'status', FieldTypeEnum::Select, [
        'allow_other' => true,
        'options' => [
            ['value' => 'draft', 'label' => 'Draft'],
        ],
    ]);

    H::storeItem($this, $collection, ['status' => 'custom-status'])->assertRedirect();
    expect(H::assemble(H::latestItem($collection))['status'])->toBe('custom-status');
});

test('multiselect radio_group checkbox_group allow_other and options', function (string $type) {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $enum = FieldTypeEnum::from($type);
    $field = H::makeField($collection, 'choice_'.$type, $enum);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'allow_other' => '0',
        'options' => [
            ['value' => 'a', 'label' => 'A'],
            ['value' => 'b', 'label' => 'B'],
        ],
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'allow_other' => false,
    ]);

    $isArray = in_array($enum, [
        FieldTypeEnum::Multiselect,
        FieldTypeEnum::CheckboxGroup,
    ], true);

    if ($isArray) {
        H::storeItem($this, $collection, ['choice_'.$type => ['a', 'nope']])
            ->assertSessionHasErrors();
        H::storeItem($this, $collection, ['choice_'.$type => ['a', 'b']])
            ->assertRedirect();
    } else {
        H::storeItem($this, $collection, ['choice_'.$type => 'nope'])
            ->assertSessionHasErrors('data.choice_'.$type);
        H::storeItem($this, $collection, ['choice_'.$type => 'a'])
            ->assertRedirect();
    }
})->with(['multiselect', 'radio_group', 'checkbox_group']);

test('checkbox_group_tree value_combining leaf strips parents on save', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'categories', FieldTypeEnum::CheckboxGroupTree);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'value_combining' => 'leaf',
        'options' => [
            [
                'value' => 'root',
                'label' => 'Root',
                'children' => [
                    ['value' => 'leaf-a', 'label' => 'Leaf A'],
                ],
            ],
        ],
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'value_combining' => 'leaf',
    ]);

    H::storeItem($this, $collection, [
        'categories' => ['root', 'leaf-a'],
    ])->assertRedirect();

    expect(H::assemble(H::latestItem($collection))['categories'])->toBe(['leaf-a']);
});

test('checkbox_group_tree value_combining all keeps parents', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    H::makeField($collection, 'categories', FieldTypeEnum::CheckboxGroupTree, [
        'value_combining' => 'all',
        'options' => [
            [
                'value' => 'root',
                'label' => 'Root',
                'children' => [
                    ['value' => 'leaf-a', 'label' => 'Leaf A'],
                ],
            ],
        ],
    ]);

    H::storeItem($this, $collection, [
        'categories' => ['root', 'leaf-a'],
    ])->assertRedirect();

    expect(H::assemble(H::latestItem($collection))['categories'])->toBe(['root', 'leaf-a']);
});

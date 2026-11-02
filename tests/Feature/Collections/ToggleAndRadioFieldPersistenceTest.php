<?php

use App\Enums\FieldTypeEnum;
use Database\Seeders\PermissionSeeder;
use Tests\Support\FieldSettingsTestHelpers as H;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

/**
 * Toggle (boolean) and radio_group item fields keep the same stored shapes after
 * the Switch / RadioGroup UI adoption (#233). Form posts still send '1'/'0' for
 * the toggle hidden input and a plain option string for radio.
 */
test('saving an item with toggle and radio fields stores boolean and option values', function (): void {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();

    H::makeField($collection, 'featured', FieldTypeEnum::Boolean, [
        'label_on' => ['en' => 'Yes'],
    ]);
    H::makeField($collection, 'status', FieldTypeEnum::RadioGroup, [
        'options' => [
            ['value' => 'draft', 'label' => 'Draft'],
            ['value' => 'published', 'label' => 'Published'],
        ],
        'allow_other' => false,
    ]);

    H::storeItem($this, $collection, [
        'featured' => '1',
        'status' => 'published',
    ])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    $item = H::latestItem($collection);
    $assembled = H::assemble($item);

    expect($assembled['featured'])->toBeTrue()
        ->and($assembled['status'])->toBe('published');

    H::updateItem($this, $collection, $item, [
        'featured' => '0',
        'status' => 'draft',
    ])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    $assembled = H::assemble($item);

    expect($assembled['featured'])->toBeFalse()
        ->and($assembled['status'])->toBe('draft');
});

test('toggle and radio accept native boolean and option payloads', function (): void {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();

    H::makeField($collection, 'active', FieldTypeEnum::Boolean);
    H::makeField($collection, 'priority', FieldTypeEnum::RadioGroup, [
        'options' => [
            ['value' => 'low', 'label' => 'Low'],
            ['value' => 'high', 'label' => 'High'],
        ],
    ]);

    H::storeItem($this, $collection, [
        'active' => true,
        'priority' => 'high',
    ])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    $assembled = H::assemble(H::latestItem($collection));

    expect($assembled['active'])->toBeTrue()
        ->and($assembled['priority'])->toBe('high');
});

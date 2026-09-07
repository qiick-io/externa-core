<?php

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use Database\Seeders\PermissionSeeder;
use Tests\Support\FieldSettingsTestHelpers as H;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('image allow_multiple mime crop_to_fit persist', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'cover', FieldTypeEnum::Image);

    $fresh = H::assertSettingsRoundtrip($this, $collection, $field, [
        'allow_multiple' => '1',
        'allowed_mime_types' => 'image/png,image/jpeg',
        'crop_to_fit' => '1',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'allow_multiple' => true,
        'crop_to_fit' => true,
    ]);

    expect($fresh->settings)->toHaveKey('allowed_mime_types')
        ->and($fresh->usesArrayStorage())->toBeTrue();
});

test('files allow_multiple and mime persist; single mode disables array storage', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'attachments', FieldTypeEnum::Files);

    $fresh = H::assertSettingsRoundtrip($this, $collection, $field, [
        'allow_multiple' => '0',
        'allowed_mime_types' => 'application/pdf',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'allow_multiple' => false,
    ]);

    expect($fresh->usesArrayStorage())->toBeFalse()
        ->and($fresh->settings)->toHaveKey('allowed_mime_types');
});

test('many_to_one relation settings persist and filter shapes options endpoint', function () {
    H::actingAsCollectionsAdmin($this);
    $related = Collection::factory()->create(['slug' => 'authors-fs']);
    $titleField = CollectionField::factory()->create([
        'collection_id' => $related->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $statusField = CollectionField::factory()->create([
        'collection_id' => $related->id,
        'name' => 'status',
        'type' => FieldTypeEnum::String,
    ]);

    $published = CollectionItem::factory()->create(['collection_id' => $related->id]);
    $published->fieldValues()->create(['field_id' => $titleField->id, 'value' => 'Visible']);
    $published->fieldValues()->create(['field_id' => $statusField->id, 'value' => 'published']);

    $draft = CollectionItem::factory()->create(['collection_id' => $related->id]);
    $draft->fieldValues()->create(['field_id' => $titleField->id, 'value' => 'Hidden']);
    $draft->fieldValues()->create(['field_id' => $statusField->id, 'value' => 'draft']);

    $host = H::makeCollection();
    $field = H::makeField($host, 'author', FieldTypeEnum::ManyToOne);

    $fresh = H::assertSettingsRoundtrip($this, $host, $field, [
        'related_collection_id' => $related->id,
        'display_field' => 'title',
        'display_template' => '{{title}}',
        'filter' => ['status' => 'published'],
        'allow_duplicates' => '0',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'related_collection_id' => $related->id,
        'display_field' => 'title',
        'display_template' => '{{title}}',
        'filter' => ['status' => 'published'],
        'allow_duplicates' => false,
    ]);

    // filter is options-picker contract (not store reject).
    $response = $this->getJson(route('collections.items.field-options', [
        'collection' => $host->id,
        'field_id' => $fresh->id,
    ]));
    $response->assertOk();
    expect(collect($response->json('data'))->pluck('id')->all())->toBe([$published->id]);

    H::storeItem($this, $host, ['author' => $published->id])->assertRedirect();
});

test('one_to_many layout and relation settings persist', function () {
    H::actingAsCollectionsAdmin($this);
    $related = Collection::factory()->create();
    $host = H::makeCollection();
    $field = H::makeField($host, 'children', FieldTypeEnum::OneToMany);

    H::assertSettingsRoundtrip($this, $host, $field, [
        'related_collection_id' => $related->id,
        'display_field' => 'title',
        'display_template' => '{{title}} — #{{id}}',
        'layout' => 'table',
        'allow_duplicates' => '1',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'related_collection_id' => $related->id,
        'display_field' => 'title',
        'display_template' => '{{title}} — #{{id}}',
        'layout' => 'table',
        'allow_duplicates' => true,
    ]);
});

test('many_to_many junction_fields persist and store meta', function () {
    H::actingAsCollectionsAdmin($this);
    $tags = Collection::factory()->create(['slug' => 'tags-fs']);
    $tag = CollectionItem::factory()->create(['collection_id' => $tags->id]);

    $host = H::makeCollection();
    $field = H::makeField($host, 'related_tags', FieldTypeEnum::ManyToMany);

    H::assertSettingsRoundtrip($this, $host, $field, [
        'related_collection_id' => $tags->id,
        'display_field' => 'title',
        'junction_fields' => [
            ['name' => 'sort', 'type' => 'number'],
        ],
        'allow_duplicates' => '0',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'related_collection_id' => $tags->id,
        'junction_fields' => [
            ['name' => 'sort', 'type' => 'number'],
        ],
    ]);

    H::storeItem($this, $host, [
        'related_tags' => [
            ['related_item_id' => $tag->id, 'meta' => ['sort' => 3]],
        ],
    ])->assertRedirect()->assertSessionHasNoErrors();

    expect(H::assemble(H::latestItem($host))['related_tags'])->toBe([
        ['related_item_id' => $tag->id, 'meta' => ['sort' => 3]],
    ]);
});

test('many_to_many allow_duplicates false rejects repeated related_item_id', function () {
    H::actingAsCollectionsAdmin($this);
    $tags = Collection::factory()->create();
    $tag = CollectionItem::factory()->create(['collection_id' => $tags->id]);
    $host = H::makeCollection();
    H::makeField($host, 'related_tags', FieldTypeEnum::ManyToMany, [
        'related_collection_id' => $tags->id,
        'allow_duplicates' => false,
    ]);

    H::storeItem($this, $host, [
        'related_tags' => [
            ['related_item_id' => $tag->id],
            ['related_item_id' => $tag->id],
        ],
    ])->assertSessionHasErrors();

    H::storeItem($this, $host, [
        'related_tags' => [
            ['related_item_id' => $tag->id],
        ],
    ])->assertRedirect();
});

test('m2a allowed_collection_ids and allow_duplicates persist', function () {
    H::actingAsCollectionsAdmin($this);
    $a = Collection::factory()->create();
    $b = Collection::factory()->create();
    $host = H::makeCollection();
    $field = H::makeField($host, 'blocks_rel', FieldTypeEnum::M2a);

    H::assertSettingsRoundtrip($this, $host, $field, [
        'allowed_collection_ids' => [$a->id, $b->id],
        'allow_duplicates' => '1',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'allowed_collection_ids' => [$a->id, $b->id],
        'allow_duplicates' => true,
    ]);
});

test('m2a allowed_collection_ids rejects foreign collection; allow_duplicates gates repeats', function () {
    H::actingAsCollectionsAdmin($this);
    $allowed = Collection::factory()->create();
    $forbidden = Collection::factory()->create();
    $allowedItem = CollectionItem::factory()->create(['collection_id' => $allowed->id]);
    $forbiddenItem = CollectionItem::factory()->create(['collection_id' => $forbidden->id]);

    $host = H::makeCollection();
    H::makeField($host, 'links', FieldTypeEnum::M2a, [
        'allowed_collection_ids' => [$allowed->id],
        'allow_duplicates' => false,
    ]);

    H::storeItem($this, $host, [
        'links' => [
            ['related_collection_id' => $forbidden->id, 'related_item_id' => $forbiddenItem->id],
        ],
    ])->assertSessionHasErrors();

    H::storeItem($this, $host, [
        'links' => [
            ['related_collection_id' => $allowed->id, 'related_item_id' => $allowedItem->id],
            ['related_collection_id' => $allowed->id, 'related_item_id' => $allowedItem->id],
        ],
    ])->assertSessionHasErrors();

    H::storeItem($this, $host, [
        'links' => [
            ['related_collection_id' => $allowed->id, 'related_item_id' => $allowedItem->id],
        ],
    ])->assertRedirect()->assertSessionHasNoErrors();
});

test('one_to_many allow_duplicates false rejects repeated ids', function () {
    H::actingAsCollectionsAdmin($this);
    $related = Collection::factory()->create();
    $child = CollectionItem::factory()->create(['collection_id' => $related->id]);
    $host = H::makeCollection();
    H::makeField($host, 'children', FieldTypeEnum::OneToMany, [
        'related_collection_id' => $related->id,
        'allow_duplicates' => false,
    ]);

    H::storeItem($this, $host, [
        'children' => [$child->id, $child->id],
    ])->assertSessionHasErrors();

    H::storeItem($this, $host, [
        'children' => [$child->id],
    ])->assertRedirect();
});

test('blocks nested field required from block_types settings enforces on store', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    H::makeField($collection, 'content', FieldTypeEnum::Blocks, [
        'block_types' => [
            [
                'key' => 'hero',
                'label' => 'Hero',
                'fields' => [
                    ['name' => 'title', 'type' => 'string', 'settings' => ['required' => true]],
                ],
            ],
        ],
    ]);

    H::storeItem($this, $collection, [
        'content' => [
            [
                'id' => (string) str()->uuid(),
                'type' => 'hero',
                'data' => [],
            ],
        ],
    ])->assertSessionHasErrors();

    H::storeItem($this, $collection, [
        'content' => [
            [
                'id' => (string) str()->uuid(),
                'type' => 'hero',
                'data' => ['title' => 'Hello'],
            ],
        ],
    ])->assertRedirect()->assertSessionHasNoErrors();
});

test('image allow_multiple false stores scalar file id shape', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'cover', FieldTypeEnum::Image);

    $fresh = H::assertSettingsRoundtrip($this, $collection, $field, [
        'allow_multiple' => '0',
        'crop_to_fit' => '0',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'allow_multiple' => false,
        'crop_to_fit' => false,
    ]);

    expect($fresh->usesArrayStorage())->toBeFalse();
});

test('blocks block_types and max_blocks_depth persist', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'content', FieldTypeEnum::Blocks);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'max_blocks_depth' => 2,
        'block_types' => [
            [
                'key' => 'hero',
                'label' => 'Hero',
                'fields' => [
                    ['name' => 'title', 'type' => 'string', 'settings' => ['required' => true]],
                ],
            ],
        ],
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'max_blocks_depth' => 2,
        'block_types.0.key' => 'hero',
        'block_types.0.fields.0.name' => 'title',
    ]);
});

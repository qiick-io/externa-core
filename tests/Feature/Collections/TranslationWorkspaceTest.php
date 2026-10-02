<?php

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\Settings\SettingsRepository;
use Database\Seeders\PermissionSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);

    app(SettingsRepository::class)->setMany(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        [
            'content_locales' => ['en', 'it'],
            'default_content_locale' => 'en',
            'fallback_content_locales' => ['en', 'it'],
        ],
    );
});

test('item store persists multi-locale values for translatable fields', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => false]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => true,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'body',
        'type' => FieldTypeEnum::Textarea,
        'translatable' => true,
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => [
            'title' => [
                'en' => 'Hello',
                'it' => 'Ciao',
            ],
            'body' => [
                'en' => 'English body',
                'it' => 'Corpo italiano',
            ],
        ],
    ])->assertRedirect();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->first();
    expect($item)->not->toBeNull();

    $data = app(CollectionItemValuesAssembler::class)->assemble($item);
    expect($data['title'])->toBe(['en' => 'Hello', 'it' => 'Ciao']);
    expect($data['body'])->toBe(['en' => 'English body', 'it' => 'Corpo italiano']);
});

test('item update can fill target locale while keeping source locale', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => false]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => true,
    ]);

    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
    ]);
    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer->sync(
        $item,
        $collection,
        $normalizer->normalize($collection, [
            'title' => ['en' => 'Hello', 'it' => ''],
        ]),
    );

    $this->put(route('collections.items.update', [$collection, $item]), [
        'data' => [
            'title' => [
                'en' => 'Hello',
                'it' => 'Ciao',
            ],
        ],
    ])->assertRedirect();

    $item->refresh();
    $data = app(CollectionItemValuesAssembler::class)->assemble($item);
    expect($data['title']['en'] ?? null)->toBe('Hello');
    expect($data['title']['it'] ?? null)->toBe('Ciao');
});

test('item form page exposes translation workspace props for multi-locale collections', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => false]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => true,
    ]);

    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
    ]);

    $this->get(route('collections.items.show', [$collection, $item]))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('collections/items/form')
            ->has('collection.fields')
            ->where('collection.fields.0.translatable', true));
});

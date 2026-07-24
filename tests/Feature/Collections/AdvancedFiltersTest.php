<?php

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\User;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use Database\Seeders\PermissionSeeder;
use Inertia\Testing\AssertableInertia;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('items index supports eq and contains operators', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'type' => FieldTypeEnum::String,
    ]);

    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);

    $a = $collection->items()->create([]);
    $writer->sync($a, $collection, $normalizer->normalize($collection, [
        'title' => 'Hello World',
        'status' => 'published',
    ], true));

    $b = $collection->items()->create([]);
    $writer->sync($b, $collection, $normalizer->normalize($collection, [
        'title' => 'Draft Note',
        'status' => 'draft',
    ], true));

    $eq = $this->get(route('collections.items.index', [
        'collection' => $collection->id,
        'filter' => ['status' => ['_eq' => 'published']],
    ]));
    $eq->assertOk();
    $eq->assertInertia(fn (AssertableInertia $page) => $page
        ->component('collections/items/index')
        ->has('items.data', 1)
        ->where('items.data.0.id', $a->id)
        ->where('filters.status._eq', 'published'));

    $contains = $this->get(route('collections.items.index', [
        'collection' => $collection->id,
        'filter' => ['title' => ['_contains' => 'draft']],
    ]));
    $contains->assertOk();
    $contains->assertInertia(fn (AssertableInertia $page) => $page
        ->component('collections/items/index')
        ->has('items.data', 1)
        ->where('items.data.0.id', $b->id));
});

test('items index AND-combines multi-field filters', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'type' => FieldTypeEnum::String,
    ]);

    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);

    $publishedHello = $collection->items()->create([]);
    $writer->sync($publishedHello, $collection, $normalizer->normalize($collection, [
        'title' => 'Hello',
        'status' => 'published',
    ], true));

    $draftHello = $collection->items()->create([]);
    $writer->sync($draftHello, $collection, $normalizer->normalize($collection, [
        'title' => 'Hello',
        'status' => 'draft',
    ], true));

    $response = $this->get(route('collections.items.index', [
        'collection' => $collection->id,
        'filter' => [
            'title' => ['_contains' => 'Hello'],
            'status' => ['_eq' => 'published'],
        ],
    ]));

    $response->assertOk();
    $response->assertInertia(fn (AssertableInertia $page) => $page
        ->component('collections/items/index')
        ->has('items.data', 1)
        ->where('items.data.0.id', $publishedHello->id)
        ->where('filters.status._eq', 'published')
        ->where('filters.title._contains', 'Hello'));
});

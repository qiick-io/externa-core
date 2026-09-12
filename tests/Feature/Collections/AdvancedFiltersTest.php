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

test('items index supports neq in null nnull and comparison operators', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'score',
        'type' => FieldTypeEnum::Number,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'notes',
        'type' => FieldTypeEnum::String,
    ]);

    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);

    $published = $collection->items()->create([]);
    $writer->sync($published, $collection, $normalizer->normalize($collection, [
        'status' => 'published',
        'score' => 10,
        'notes' => 'hello',
    ], true));

    $draft = $collection->items()->create([]);
    $writer->sync($draft, $collection, $normalizer->normalize($collection, [
        'status' => 'draft',
        'score' => 3,
        'notes' => 'world',
    ], true));

    $emptyNotes = $collection->items()->create([]);
    $writer->sync($emptyNotes, $collection, $normalizer->normalize($collection, [
        'status' => 'archived',
        'score' => 7,
    ], true));

    $itemIds = static fn (mixed $data): array => collect($data)->pluck('id')->sort()->values()->all();
    $sameIds = static fn (array $expected): Closure => static function (mixed $data) use ($expected, $itemIds): bool {
        return $itemIds($data) === collect($expected)->sort()->values()->all();
    };

    $this->get(route('collections.items.index', [
        'collection' => $collection->id,
        'filter' => ['status' => ['_neq' => 'published']],
    ]))->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
        ->component('collections/items/index')
        ->has('items.data', 2)
        ->where('filters.status._neq', 'published')
        ->where('items.data', $sameIds([$draft->id, $emptyNotes->id])));

    $this->get(route('collections.items.index', [
        'collection' => $collection->id,
        'filter' => ['status' => ['_in' => 'published,archived']],
    ]))->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
        ->component('collections/items/index')
        ->has('items.data', 2)
        ->where('items.data', $sameIds([$published->id, $emptyNotes->id])));

    $this->get(route('collections.items.index', [
        'collection' => $collection->id,
        'filter' => ['notes' => ['_null' => '1']],
    ]))->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
        ->component('collections/items/index')
        ->has('items.data', 1)
        ->where('items.data.0.id', $emptyNotes->id));

    $this->get(route('collections.items.index', [
        'collection' => $collection->id,
        'filter' => ['notes' => ['_nnull' => '1']],
    ]))->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
        ->component('collections/items/index')
        ->has('items.data', 2)
        ->where('items.data', $sameIds([$published->id, $draft->id])));

    $this->get(route('collections.items.index', [
        'collection' => $collection->id,
        'filter' => ['score' => ['_gte' => '7']],
    ]))->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
        ->component('collections/items/index')
        ->has('items.data', 2)
        ->where('items.data', $sameIds([$published->id, $emptyNotes->id])));

    $this->get(route('collections.items.index', [
        'collection' => $collection->id,
        'filter' => ['score' => ['_gt' => '7']],
    ]))->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
        ->component('collections/items/index')
        ->has('items.data', 1)
        ->where('items.data.0.id', $published->id));

    $this->get(route('collections.items.index', [
        'collection' => $collection->id,
        'filter' => ['score' => ['_lte' => '7']],
    ]))->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
        ->component('collections/items/index')
        ->has('items.data', 2)
        ->where('items.data', $sameIds([$draft->id, $emptyNotes->id])));

    $this->get(route('collections.items.index', [
        'collection' => $collection->id,
        'filter' => ['score' => ['_lt' => '7']],
    ]))->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
        ->component('collections/items/index')
        ->has('items.data', 1)
        ->where('items.data.0.id', $draft->id));
});

test('items index AND-combines multi-rule filters across different field types', function () {
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
        'name' => 'score',
        'type' => FieldTypeEnum::Number,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'type' => FieldTypeEnum::String,
    ]);

    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);

    $match = $collection->items()->create([]);
    $writer->sync($match, $collection, $normalizer->normalize($collection, [
        'title' => 'Alpha',
        'score' => 12,
        'status' => 'published',
    ], true));

    $wrongStatus = $collection->items()->create([]);
    $writer->sync($wrongStatus, $collection, $normalizer->normalize($collection, [
        'title' => 'Alpha',
        'score' => 15,
        'status' => 'draft',
    ], true));

    $lowScore = $collection->items()->create([]);
    $writer->sync($lowScore, $collection, $normalizer->normalize($collection, [
        'title' => 'Alpha',
        'score' => 4,
        'status' => 'published',
    ], true));

    $response = $this->get(route('collections.items.index', [
        'collection' => $collection->id,
        'filter' => [
            'title' => ['_contains' => 'Alpha'],
            'score' => ['_gte' => '10'],
            'status' => ['_eq' => 'published'],
        ],
    ]));

    $response->assertOk();
    $response->assertInertia(fn (AssertableInertia $page) => $page
        ->component('collections/items/index')
        ->has('items.data', 1)
        ->where('items.data.0.id', $match->id)
        ->where('filters.title._contains', 'Alpha')
        ->where('filters.score._gte', '10')
        ->where('filters.status._eq', 'published'));
});

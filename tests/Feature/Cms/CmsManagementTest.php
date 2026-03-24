<?php

use App\Enums\FieldType;
use App\Http\Resources\ItemResource;
use App\Models\ContentCollection;
use App\Models\Field;
use App\Models\Item;
use App\Models\User;
use Illuminate\Http\Request;

test('guests cannot access cms routes', function () {
    $response = $this->get(route('cms.collections.index'));
    $response->assertRedirect(route('login'));
});

test('collection create and edit pages are not registered', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = ContentCollection::factory()->create();

    $this->get('/cms/collections/create')->assertNotFound();
    $this->get('/cms/collections/'.$collection->id.'/edit')->assertNotFound();
});

test('authenticated verified users can create collections fields and items', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $response = $this->post(route('cms.collections.store'), [
        'name' => 'Blog',
        'slug' => 'blog',
    ]);

    $collection = ContentCollection::query()->where('slug', 'blog')->first();
    $response->assertRedirect(route('cms.collections.show', $collection));
    expect($collection)->not->toBeNull();

    $this->post(route('cms.collections.fields.store', $collection), [
        'name' => 'title',
        'type' => FieldType::String->value,
        'translatable' => '1',
    ])->assertRedirect();

    $field = Field::query()->where('collection_id', $collection->id)->first();
    expect($field)->not->toBeNull();
    expect($field->translatable)->toBeTrue();

    $this->post(route('cms.collections.items.store', $collection), [
        'data' => [
            'title' => [
                'en' => 'Hello',
                'it' => 'Ciao',
            ],
        ],
    ])->assertRedirect();

    $item = Item::query()->first();
    expect($item)->not->toBeNull();
    expect($item->data['title']['en'])->toBe('Hello');
});

test('items can be filtered by translatable field', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = ContentCollection::factory()->create();
    Field::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldType::String,
        'translatable' => true,
    ]);

    Item::factory()->create([
        'collection_id' => $collection->id,
        'data' => [
            'title' => [
                'en' => 'UniqueHelloWord',
                'it' => 'Altro',
            ],
        ],
    ]);

    $response = $this->get(route('cms.collections.items.index', [
        'collection' => $collection->id,
        'filter' => ['title' => 'uniquehello'],
    ]));

    $response->assertOk();
});

test('item resource flattens translations for current locale', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = ContentCollection::factory()->create();
    Field::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldType::String,
        'translatable' => true,
    ]);

    $item = Item::factory()->create([
        'collection_id' => $collection->id,
        'data' => [
            'title' => [
                'en' => 'Hello',
                'it' => 'Ciao',
            ],
        ],
    ]);

    $item->load(['collection.fields']);

    $request = Request::create('/test', 'GET', ['locale' => 'it']);
    app()->instance('request', $request);

    $payload = (new ItemResource($item))->toArray($request);

    expect($payload['data']['title'])->toBe('Ciao');
});

test('collection slug is generated from name when slug is omitted', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $response = $this->post(route('cms.collections.store'), [
        'name' => 'My Page',
    ]);

    $collection = ContentCollection::query()->where('name', 'My Page')->first();
    expect($collection)->not->toBeNull();
    $response->assertRedirect(route('cms.collections.show', $collection));
    expect($collection->slug)->toBe('my-page');
});

test('singleton collection rejects a second item', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = ContentCollection::factory()->create(['is_singleton' => true]);
    Field::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldType::String,
    ]);

    $this->post(route('cms.collections.items.store', $collection), [
        'data' => ['title' => 'First'],
    ])->assertRedirect();

    $this->post(route('cms.collections.items.store', $collection), [
        'data' => ['title' => 'Second'],
    ])->assertStatus(422);
});

test('item store from collection hub redirects to collection show with item query', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = ContentCollection::factory()->create(['is_singleton' => false]);
    Field::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldType::String,
    ]);

    $response = $this->post(route('cms.collections.items.store', $collection), [
        '_from_collection_hub' => '1',
        'data' => ['title' => 'Hello hub'],
    ]);

    $item = Item::query()->where('collection_id', $collection->id)->first();
    expect($item)->not->toBeNull();

    $response->assertRedirect(
        route('cms.collections.show', $collection).'?'.http_build_query(['item' => $item->id])
    );
});

test('item update from collection hub redirects to collection show with item query', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = ContentCollection::factory()->create(['is_singleton' => false]);
    Field::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldType::String,
    ]);

    $item = Item::factory()->create([
        'collection_id' => $collection->id,
        'data' => ['title' => 'Old'],
    ]);

    $response = $this->put(route('cms.collections.items.update', [$collection, $item]), [
        '_from_collection_hub' => '1',
        'data' => ['title' => 'New'],
    ]);

    $response->assertRedirect(
        route('cms.collections.show', $collection).'?'.http_build_query(['item' => $item->id])
    );
});

test('singleton content can be upserted from the singleton route', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = ContentCollection::factory()->create(['is_singleton' => true]);
    Field::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldType::String,
    ]);

    $this->put(route('cms.collections.singleton-content', $collection), [
        'data' => ['title' => 'Hello'],
    ])->assertRedirect();

    expect(Item::query()->where('collection_id', $collection->id)->count())->toBe(1);

    $this->put(route('cms.collections.singleton-content', $collection), [
        'data' => ['title' => 'Updated'],
    ])->assertRedirect();

    $item = Item::query()->where('collection_id', $collection->id)->first();
    expect($item)->not->toBeNull();
    expect($item->data['title'])->toBe('Updated');
});

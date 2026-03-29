<?php

use App\Enums\FieldTypeEnum;
use App\Http\Resources\ItemResource;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemValue;
use App\Models\User;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use Illuminate\Http\Request;
use Inertia\Testing\AssertableInertia;

test('guests cannot access collection routes', function () {
    $response = $this->get(route('collections.index'));
    $response->assertRedirect(route('login'));
});

test('collection create and edit pages are not registered', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->get('/collections/create')->assertNotFound();
    $this->get('/collections/'.$collection->id.'/edit')->assertNotFound();
});

test('authenticated verified users can create collections fields and items', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $response = $this->post(route('collections.store'), [
        'name' => 'Blog',
        'slug' => 'blog',
    ]);

    $collection = Collection::query()->where('slug', 'blog')->first();
    $response->assertRedirect(route('collections.show', $collection));
    expect($collection)->not->toBeNull();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'title',
        'type' => FieldTypeEnum::String->value,
        'translatable' => '1',
    ])->assertRedirect();

    $field = CollectionField::query()->where('collection_id', $collection->id)->first();
    expect($field)->not->toBeNull();
    expect($field->translatable)->toBeTrue();

    $this->post(route('collections.items.store', $collection), [
        'data' => [
            'title' => [
                'en' => 'Hello',
                'it' => 'Ciao',
            ],
        ],
    ])->assertRedirect();

    $item = CollectionItem::query()->first();
    expect($item)->not->toBeNull();
    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item);
    expect($assembled['title']['en'])->toBe('Hello');
});

test('items can be filtered by translatable field', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => true,
    ]);

    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
    ]);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $normalized = $normalizer->normalize($collection, [
        'title' => [
            'en' => 'UniqueHelloWord',
            'it' => 'Altro',
        ],
    ]);
    app(CollectionItemValuesWriter::class)->sync($item, $collection, $normalized);

    $response = $this->get(route('collections.items.index', [
        'collection' => $collection->id,
        'filter' => ['title' => 'uniquehello'],
    ]));

    $response->assertOk();
});

test('item resource flattens translations for current locale', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => true,
    ]);

    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
    ]);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $normalized = $normalizer->normalize($collection, [
        'title' => [
            'en' => 'Hello',
            'it' => 'Ciao',
        ],
    ]);
    app(CollectionItemValuesWriter::class)->sync($item, $collection, $normalized);

    $item->load(['collection.fields']);

    $request = Request::create('/test', 'GET', ['locale' => 'it']);
    app()->instance('request', $request);

    $payload = (new ItemResource($item))->toArray($request);

    expect($payload['data']['title'])->toBe('Ciao');
});

test('collection slug is generated from name when slug is omitted', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $response = $this->post(route('collections.store'), [
        'name' => 'My Page',
    ]);

    $collection = Collection::query()->where('name', 'My Page')->first();
    expect($collection)->not->toBeNull();
    $response->assertRedirect(route('collections.show', $collection));
    expect($collection->slug)->toBe('my-page');
});

test('singleton collection rejects a second item', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => true]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => ['title' => 'First'],
    ])->assertRedirect();

    $this->post(route('collections.items.store', $collection), [
        'data' => ['title' => 'Second'],
    ])->assertStatus(422);
});

test('item store redirects to item edit', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => false]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $response = $this->post(route('collections.items.store', $collection), [
        'data' => ['title' => 'Hello hub'],
    ]);

    $item = CollectionItem::query()->where('collection_id', $collection->id)->first();
    expect($item)->not->toBeNull();

    $response->assertRedirect(route('collections.items.show', [$collection, $item]));
});

test('item update redirects to item edit', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => false]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
    ]);
    app(CollectionItemValuesWriter::class)->sync($item, $collection, app(CollectionItemDataNormalizer::class)->normalize($collection, ['title' => 'Old']));

    $response = $this->put(route('collections.items.update', [$collection, $item]), [
        'data' => ['title' => 'New'],
    ]);

    $response->assertRedirect(route('collections.items.show', [$collection, $item]));
});

test('singleton content can be upserted from the singleton route', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => true]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $this->put(route('collections.singleton-content', $collection), [
        'data' => ['title' => 'Hello'],
    ])->assertRedirect();

    expect(CollectionItem::query()->where('collection_id', $collection->id)->count())->toBe(1);

    $this->put(route('collections.singleton-content', $collection), [
        'data' => ['title' => 'Updated'],
    ])->assertRedirect();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->first();
    expect($item)->not->toBeNull();
    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item);
    expect($assembled['title'])->toBe('Updated');
});

test('item field value rows are synced when item content is saved', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => ['title' => 'Stored'],
    ])->assertRedirect();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->first();
    expect($item)->not->toBeNull();

    $rows = CollectionItemValue::query()->where('item_id', $item->id)->where('field_id', $field->id)->get();
    expect($rows)->toHaveCount(1);
    expect($rows->first()->value)->toBe('Stored');
});

test('collection item new page renders the same form component as show', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->get(route('collections.items.new', $collection))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/items/form')
            ->where('isNew', true));
});

test('creating singleton collection seeds an empty item row', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $this->post(route('collections.store'), [
        'name' => 'Singleton home',
        'slug' => 'singleton-home',
        'is_singleton' => true,
    ])->assertRedirect();

    $collection = Collection::query()->where('slug', 'singleton-home')->first();
    expect($collection)->not->toBeNull();
    expect(CollectionItem::query()->where('collection_id', $collection->id)->count())->toBe(1);
});

test('non-singleton collection show redirects to items index', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => false]);

    $this->get(route('collections.show', $collection))
        ->assertRedirect(route('collections.items.index', $collection));
});

test('collection fields page renders field setup', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->get(route('collections.fields.index', $collection))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/collections/fields'));
});

<?php

use App\Enums\FieldTypeEnum;
use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Http\Resources\CollectionItemResource;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemValue;
use App\Models\File;
use App\Models\User;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use Database\Seeders\PermissionSeeder;
use Illuminate\Http\Request;
use Inertia\Testing\AssertableInertia;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('guests cannot access collection routes', function () {
    $response = $this->get(route('collections.index'));
    $response->assertRedirect(route('login'));
});

test('collection create and edit pages are not registered', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->get('/collections/create')->assertNotFound();
    $this->get('/collections/'.$collection->id.'/edit')->assertNotFound();
});

test('authenticated verified users can create collections fields and items', function () {
    $user = grantCollectionPermissions(User::factory()->create());
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
    $user = grantCollectionPermissions(User::factory()->create());
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
    $user = grantCollectionPermissions(User::factory()->create());
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

    $payload = (new CollectionItemResource($item))->toArray($request);

    expect($payload['data']['title'])->toBe('Ciao');
});

test('collection slug is generated from name when slug is omitted', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $response = $this->post(route('collections.store'), [
        'name' => 'My Page',
    ]);

    $collection = Collection::query()->where('name', 'My Page')->first();
    expect($collection)->not->toBeNull();
    $response->assertRedirect(route('collections.show', $collection));
    expect($collection->slug)->toBe('my-page');
});

test('collection slug must be unique on create', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    Collection::factory()->create(['slug' => 'taken']);

    $this->post(route('collections.store'), [
        'name' => 'Other',
        'slug' => 'taken',
    ])->assertSessionHasErrors('slug');
});

test('collection slug must match slug format', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    // Str::slug of punctuation-only input is empty → fails required/regex.
    $this->post(route('collections.store'), [
        'name' => 'Bad',
        'slug' => '!!!',
    ])->assertSessionHasErrors('slug');
});

test('collection slug uniqueness ignores current collection on update', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'name' => 'Mine',
        'slug' => 'mine',
    ]);
    Collection::factory()->create(['slug' => 'other']);

    $this->put(route('collections.update', $collection), [
        'name' => 'Mine Renamed',
        'slug' => 'mine',
    ])->assertRedirect();

    expect($collection->fresh()->slug)->toBe('mine')
        ->and($collection->fresh()->name)->toBe('Mine Renamed');

    $this->put(route('collections.update', $collection), [
        'name' => 'Mine',
        'slug' => 'other',
    ])->assertSessionHasErrors('slug');
});

test('collection slug availability endpoint reports uniqueness', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['slug' => 'kitchen-sink']);

    $this->getJson(route('collections.slug-available', ['slug' => 'kitchen-sink']))
        ->assertOk()
        ->assertJson(['available' => false, 'slug' => 'kitchen-sink']);

    $this->getJson(route('collections.slug-available', [
        'slug' => 'kitchen-sink',
        'exclude' => $collection->id,
    ]))
        ->assertOk()
        ->assertJson(['available' => true, 'slug' => 'kitchen-sink']);

    $this->getJson(route('collections.slug-available', ['slug' => 'brand-new']))
        ->assertOk()
        ->assertJson(['available' => true, 'slug' => 'brand-new']);
});

test('singleton collection rejects a second item', function () {
    $user = grantCollectionPermissions(User::factory()->create());
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
    $user = grantCollectionPermissions(User::factory()->create());
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

test('item store with save_action create_new redirects to new item form', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => false]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $response = $this->post(route('collections.items.store', $collection), [
        'data' => ['title' => 'Next'],
        'save_action' => 'create_new',
    ]);

    expect(CollectionItem::query()->where('collection_id', $collection->id)->count())->toBe(1);
    $response->assertRedirect(route('collections.items.new', $collection));
});

test('item update with save_action copy creates a new item', function () {
    $user = grantCollectionPermissions(User::factory()->create());
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
        'data' => ['title' => 'Copy'],
        'save_action' => 'copy',
    ]);

    $items = CollectionItem::query()->where('collection_id', $collection->id)->orderBy('id')->get();
    expect($items)->toHaveCount(2);
    expect(app(CollectionItemValuesAssembler::class)->assemble($items[0])['title'])->toBe('Old');
    expect(app(CollectionItemValuesAssembler::class)->assemble($items[1])['title'])->toBe('Copy');
    $response->assertRedirect(route('collections.items.show', [$collection, $items[1]]));
});

test('item update copy requires create permission', function () {
    $user = grantCollectionPermissions(User::factory()->create(), [
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanEditCollections->value,
    ]);
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

    $this->put(route('collections.items.update', [$collection, $item]), [
        'data' => ['title' => 'Copy'],
        'save_action' => 'copy',
    ])->assertForbidden();

    expect(CollectionItem::query()->where('collection_id', $collection->id)->count())->toBe(1);
});

test('item update redirects to item edit', function () {
    $user = grantCollectionPermissions(User::factory()->create());
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
    $user = grantCollectionPermissions(User::factory()->create());
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
    $user = grantCollectionPermissions(User::factory()->create());
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
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->get(route('collections.items.new', $collection))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/items/form')
            ->where('isNew', true));
});

test('creating singleton collection seeds an empty item row', function () {
    $user = grantCollectionPermissions(User::factory()->create());
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

test('collection singleton flag cannot be changed on update', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => false]);

    $this->from(route('collections.index'))
        ->put(route('collections.update', $collection), [
            'name' => 'Updated name',
            'slug' => $collection->slug,
            'is_singleton' => true,
        ])
        ->assertSessionHasErrors('is_singleton');

    expect($collection->fresh()->is_singleton)->toBeFalse();
    expect($collection->fresh()->name)->not->toBe('Updated name');
});

test('collection update ignores unchanged singleton flag in payload', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => true]);

    $this->from(route('collections.show', $collection))
        ->put(route('collections.update', $collection), [
            'name' => 'Singleton page',
            'slug' => $collection->slug,
            'is_singleton' => true,
        ])
        ->assertRedirect(route('collections.show', $collection));

    expect($collection->fresh()->is_singleton)->toBeTrue();
    expect($collection->fresh()->name)->toBe('Singleton page');
});

test('non-singleton collection show redirects to items index', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => false]);

    $this->get(route('collections.show', $collection))
        ->assertRedirect(route('collections.items.index', $collection));
});

test('collection fields page renders field setup', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->get(route('collections.fields.index', $collection))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/collections/fields')
            ->has('relatedCollections'));
});

test('collection fields can be reordered', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $firstField = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'sort_order' => 1,
    ]);
    $secondField = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'body',
        'sort_order' => 2,
    ]);

    $this->post(route('collections.fields.reorder', $collection), [
        'ids' => [$secondField->id, $firstField->id],
    ])->assertRedirect(route('collections.fields.index', $collection));

    expect($firstField->fresh()->sort_order)->toBe(2);
    expect($secondField->fresh()->sort_order)->toBe(1);
});

test('collection field reorder can persist layout row breaks', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $titleField = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'sort_order' => 1,
        'settings' => ['layout_width' => 'half'],
    ]);
    $statusField = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'sort_order' => 2,
        'settings' => ['layout_width' => 'half'],
    ]);

    $this->post(route('collections.fields.reorder', $collection), [
        'ids' => [$titleField->id, $statusField->id],
        'starts_new_row_ids' => [$statusField->id],
    ])->assertRedirect(route('collections.fields.index', $collection));

    expect($statusField->fresh()->settings['layout_starts_new_row'] ?? null)->toBeTrue();
    expect($titleField->fresh()->settings)->not->toHaveKey('layout_starts_new_row');
});

test('collection field reorder skips settings writes when unchanged', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $titleField = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'sort_order' => 1,
        'settings' => ['layout_width' => 'half'],
    ]);
    $statusField = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'sort_order' => 2,
        'settings' => [
            'layout_width' => 'half',
            'layout_starts_new_row' => true,
        ],
    ]);

    // Pure order swap; row breaks already match payload — settings must stay put.
    $this->post(route('collections.fields.reorder', $collection), [
        'ids' => [$statusField->id, $titleField->id],
        'starts_new_row_ids' => [$statusField->id],
    ])->assertRedirect(route('collections.fields.index', $collection));

    expect($titleField->fresh()->settings)->toBe(['layout_width' => 'half'])
        ->and($statusField->fresh()->settings)->toBe([
            'layout_width' => 'half',
            'layout_starts_new_row' => true,
        ])
        ->and($statusField->fresh()->sort_order)->toBe(1)
        ->and($titleField->fresh()->sort_order)->toBe(2);
});

test('collection field can be duplicated', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'settings' => ['required' => true],
    ]);

    $this->post(route('collections.fields.duplicate', [$collection, $field]))
        ->assertRedirect(route('collections.fields.index', $collection));

    $duplicate = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'title_copy')
        ->first();

    expect($duplicate)->not->toBeNull();
    expect($duplicate->type)->toBe(FieldTypeEnum::String);
    expect($duplicate->settings['required'])->toBeTrue();
});

test('collection field form visibility can be toggled', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'internal_note',
        'settings' => ['required' => true],
    ]);

    $this->post(route('collections.fields.toggle-form-visibility', [$collection, $field]))
        ->assertRedirect(route('collections.fields.index', $collection));

    expect($field->fresh()->isHiddenInForm())->toBeTrue();

    $this->post(route('collections.fields.toggle-form-visibility', [$collection, $field]))
        ->assertRedirect(route('collections.fields.index', $collection));

    expect($field->fresh()->isHiddenInForm())->toBeFalse();
});

test('hidden collection fields are not validated on item create', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'visible_title',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'hidden_title',
        'type' => FieldTypeEnum::String,
        'settings' => ['required' => true, 'hidden_in_form' => true],
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => ['visible_title' => 'Hello'],
    ])->assertRedirect();
});

test('collection field layout width can be updated', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'sort',
        'type' => FieldTypeEnum::Number,
    ]);

    $this->post(route('collections.fields.update-layout-width', [$collection, $field]), [
        'layout_width' => 'half',
    ])->assertRedirect(route('collections.fields.index', $collection));

    expect($field->fresh()->layoutWidth())->toBe('half');
});

test('updating field settings preserves layout width and starts-new-row', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'settings' => ['layout_width' => 'full'],
    ]);

    $this->patch(route('collections.fields.update', [$collection, $field]), [
        'settings' => [
            'required' => '1',
            'readonly' => '0',
            'hidden_in_form' => '0',
            'layout_width' => 'half',
            'layout_starts_new_row' => '1',
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    $settings = $field->fresh()->settings;
    expect($settings['layout_width'] ?? null)->toBe('half');
    expect($settings['layout_starts_new_row'] ?? null)->toBe('1');
    expect($settings['required'] ?? null)->toBe('1');
});

test('duplicated field keeps layout width setting', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'sort',
        'settings' => ['layout_width' => 'half'],
    ]);

    $this->post(route('collections.fields.duplicate', [$collection, $field]))
        ->assertRedirect(route('collections.fields.index', $collection));

    $duplicate = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'sort_copy')
        ->first();

    expect($duplicate)->not->toBeNull();
    expect($duplicate->layoutWidth())->toBe('half');
});

test('collection field can be updated from edit form payload', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'headline',
        'type' => FieldTypeEnum::String,
        'settings' => ['required' => false],
    ]);

    $this->patch(route('collections.fields.update', [$collection, $field]), [
        'name' => 'headline',
        'type' => FieldTypeEnum::String->value,
        'settings' => [
            'input_type' => 'string',
            'required' => '1',
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    expect($field->fresh()->settings['required'])->toBe('1');
});

test('string field stores input settings payload', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'headline',
        'type' => FieldTypeEnum::String->value,
        'settings' => [
            'input_type' => 'integer',
            'default_value' => '42',
            'required' => '1',
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    $field = CollectionField::query()->where('collection_id', $collection->id)->first();
    expect($field)->not->toBeNull();
    expect($field->settings['input_type'])->toBe('integer');
    expect($field->settings['default_value'])->toBe('42');
    expect($field->settings['required'])->toBe('1');
});

test('required string field is enforced when saving item content', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'headline',
        'type' => FieldTypeEnum::String,
        'settings' => ['required' => true],
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => [],
    ])->assertSessionHasErrors('data.headline');

    $this->post(route('collections.items.store', $collection), [
        'data' => ['headline' => 'Hello'],
    ])->assertRedirect();
});

test('select field stores options from structured settings payload', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'status',
        'type' => FieldTypeEnum::Select->value,
        'settings' => [
            'options' => [
                ['value' => 'draft', 'label' => 'Draft'],
                ['value' => 'published', 'label' => 'Published'],
            ],
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    $field = CollectionField::query()->where('collection_id', $collection->id)->first();
    expect($field)->not->toBeNull();
    expect($field->settings['options'][0]['value'])->toBe('draft');
});

test('wysiwyg field create accepts empty placeholder locales', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    // Mimics the browser form: empty locale inputs become null via ConvertEmptyStringsToNull.
    $this->post(route('collections.fields.store', $collection), [
        'name' => 'body_html',
        'type' => FieldTypeEnum::Wysiwyg->value,
        'translatable' => '0',
        'settings' => [
            'required' => '0',
            'readonly' => '0',
            'hidden_in_form' => '0',
            'rows' => '6',
            'placeholder' => [
                'en' => null,
                'it' => null,
                'de-DE' => null,
            ],
            'max_length' => null,
        ],
    ])
        ->assertSessionDoesntHaveErrors()
        ->assertRedirect(route('collections.fields.index', $collection));

    $field = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'body_html')
        ->first();

    expect($field)->not->toBeNull();
    expect($field->type)->toBe(FieldTypeEnum::Wysiwyg);
    expect($field->settings['placeholder'] ?? null)->toBeNull();
});

test('autocomplete and wysiwyg field types can be created', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'category',
        'type' => FieldTypeEnum::Autocomplete->value,
        'settings' => [
            'options' => [
                ['value' => 'news', 'label' => 'News'],
            ],
            'placeholder' => ['en' => 'Pick a category'],
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'body',
        'type' => FieldTypeEnum::Wysiwyg->value,
    ])->assertRedirect(route('collections.fields.index', $collection));

    $autocompleteField = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'category')
        ->first();

    expect($autocompleteField)->not->toBeNull();
    expect($autocompleteField->type)->toBe(FieldTypeEnum::Autocomplete);
    expect($autocompleteField->settings['options'][0]['value'])->toBe('news');
    expect($autocompleteField->settings['placeholder']['en'])->toBe('Pick a category');

    expect(
        CollectionField::query()
            ->where('collection_id', $collection->id)
            ->pluck('type')
            ->map(fn (FieldTypeEnum $type) => $type->value)
            ->sort()
            ->values()
            ->all(),
    )->toBe(['autocomplete', 'wysiwyg']);
});

test('api autocomplete field type can be created with remote settings', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'city',
        'type' => FieldTypeEnum::ApiAutocomplete->value,
        'settings' => [
            'url' => 'https://api.example.com/cities?q={{value}}',
            'results_path' => 'data.items',
            'text_path' => 'name',
            'value_path' => 'id',
            'trigger' => 'debounce',
            'rate' => 400,
            'placeholder' => ['en' => 'Search cities…'],
            'icon_left' => 'Search',
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    $field = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'city')
        ->first();

    expect($field)->not->toBeNull();
    expect($field->type)->toBe(FieldTypeEnum::ApiAutocomplete);
    expect($field->settings['url'])->toBe('https://api.example.com/cities?q={{value}}');
    expect($field->settings['results_path'])->toBe('data.items');
    expect($field->settings['text_path'])->toBe('name');
    expect($field->settings['value_path'])->toBe('id');
    expect($field->settings['trigger'])->toBe('debounce');
    expect($field->settings['rate'])->toBe(400);
    expect($field->settings['placeholder']['en'])->toBe('Search cities…');
    expect($field->settings['icon_left'])->toBe('Search');
});

test('api autocomplete field requires a url template', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'city',
        'type' => FieldTypeEnum::ApiAutocomplete->value,
        'settings' => [
            'results_path' => 'data',
            'text_path' => 'label',
            'value_path' => 'value',
        ],
    ])->assertSessionHasErrors(['settings.url']);

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'city',
        'type' => FieldTypeEnum::ApiAutocomplete->value,
        'settings' => [
            'url' => '',
            'results_path' => 'data',
        ],
    ])->assertSessionHasErrors(['settings.url']);
});

test('selection field types can be created', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'location',
        'type' => FieldTypeEnum::Map->value,
    ])->assertRedirect(route('collections.fields.index', $collection));

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'features',
        'type' => FieldTypeEnum::CheckboxGroup->value,
        'settings' => [
            'options' => [
                ['value' => 'a', 'label' => 'Feature A'],
            ],
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'categories',
        'type' => FieldTypeEnum::CheckboxGroupTree->value,
        'settings' => [
            'options' => [
                [
                    'value' => 'root',
                    'label' => 'Root',
                    'children' => [
                        ['value' => 'child', 'label' => 'Child'],
                    ],
                ],
            ],
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    expect(
        CollectionField::query()
            ->where('collection_id', $collection->id)
            ->pluck('type')
            ->map(fn (FieldTypeEnum $type) => $type->value)
            ->sort()
            ->values()
            ->all(),
    )->toBe(['checkbox_group', 'checkbox_group_tree', 'map']);
});

test('relational field types can be created', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $related = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'gallery',
        'type' => FieldTypeEnum::Image->value,
        'settings' => ['allow_multiple' => true],
    ])->assertRedirect(route('collections.fields.index', $collection));

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'attachments',
        'type' => FieldTypeEnum::Files->value,
    ])->assertRedirect(route('collections.fields.index', $collection));

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'author',
        'type' => FieldTypeEnum::ManyToOne->value,
        'settings' => [
            'related_collection_id' => $related->id,
            'display_field' => 'title',
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'builder',
        'type' => FieldTypeEnum::M2a->value,
        'settings' => [
            'allowed_collection_ids' => [$related->id],
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    expect(
        CollectionField::query()
            ->where('collection_id', $collection->id)
            ->pluck('type')
            ->map(fn (FieldTypeEnum $type) => $type->value)
            ->sort()
            ->values()
            ->all(),
    )->toBe(['files', 'image', 'm2a', 'many_to_one']);
});

test('other field types can be created', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'token',
        'type' => FieldTypeEnum::Hash->value,
    ])->assertRedirect(route('collections.fields.index', $collection));

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'volume',
        'type' => FieldTypeEnum::Slider->value,
        'settings' => [
            'min' => 0,
            'max' => 10,
            'step' => 1,
            'default_value' => 5,
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    expect(
        CollectionField::query()
            ->where('collection_id', $collection->id)
            ->pluck('type')
            ->map(fn (FieldTypeEnum $type) => $type->value)
            ->sort()
            ->values()
            ->all(),
    )->toBe(['hash', 'slider']);
});

test('cannot set translatable true on many_to_one or hash fields', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $related = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'author',
        'type' => FieldTypeEnum::ManyToOne->value,
        'translatable' => '1',
        'settings' => [
            'related_collection_id' => $related->id,
            'display_field' => 'title',
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    $relationField = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'author')
        ->firstOrFail();
    expect($relationField->translatable)->toBeFalse();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'fingerprint',
        'type' => FieldTypeEnum::Hash->value,
        'translatable' => '1',
    ])->assertRedirect(route('collections.fields.index', $collection));

    $hashField = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'fingerprint')
        ->firstOrFail();
    expect($hashField->translatable)->toBeFalse();

    // Legacy true flag is coerced false on next update for disallowed types.
    $hashField->update(['translatable' => true]);
    $this->patch(route('collections.fields.update', [$collection, $hashField]), [
        'name' => 'fingerprint',
    ])->assertRedirect(route('collections.fields.index', $collection));

    expect($hashField->fresh()->translatable)->toBeFalse();
});

test('hash field value is auto generated on item create', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'token',
        'type' => FieldTypeEnum::Hash,
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => [
            'token' => '',
        ],
    ])->assertRedirect();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->first();

    expect($item)->not->toBeNull();

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item);

    expect($assembled['token'] ?? null)
        ->toBeString()
        ->toHaveLength(64);
});

test('field stores common settings payload', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'headline',
        'type' => FieldTypeEnum::String->value,
        'settings' => [
            'display_name' => ['en' => 'Headline', 'it' => 'Titolo'],
            'note' => ['en' => 'Shown under the label', 'it' => 'Mostrato sotto l\'etichetta'],
            'required' => '1',
            'readonly' => '0',
            'placeholder' => ['en' => 'Enter headline'],
            'icon_left' => 'Type',
            'trim' => '1',
            'max_length' => 120,
            'validation_rules' => [
                ['operator' => 'max_length', 'value' => 120],
            ],
            'validation_message' => ['en' => 'Too long'],
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    $field = CollectionField::query()->where('collection_id', $collection->id)->first();
    expect($field)->not->toBeNull();
    expect($field->displayName('en'))->toBe('Headline');
    expect($field->displayName('it'))->toBe('Titolo');
    expect($field->note('en'))->toBe('Shown under the label');
    expect($field->settings['icon_left'])->toBe('Type');
    expect($field->settings['max_length'])->toBe(120);
});

test('string field trim and slugify are applied when saving item content', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'slug',
        'type' => FieldTypeEnum::String,
        'settings' => ['trim' => true, 'slugify' => true],
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => ['slug' => '  Hello World  '],
    ])->assertRedirect();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->first();
    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item);
    expect($assembled['slug'])->toBe('hello-world');
});

test('number code and tag type settings persist on update', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $number = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'qty',
        'type' => FieldTypeEnum::Number,
        'settings' => ['min' => 0],
    ]);
    $code = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'payload',
        'type' => FieldTypeEnum::Code,
        'settings' => ['language' => 'json'],
    ]);
    $tag = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'labels',
        'type' => FieldTypeEnum::Tag,
        'settings' => [],
    ]);

    $this->patch(route('collections.fields.update', [$collection, $number]), [
        'settings' => [
            'min' => 1,
            'max' => 99,
            'step' => 2,
            'required' => '0',
        ],
    ])->assertRedirect();

    $this->patch(route('collections.fields.update', [$collection, $code]), [
        'settings' => [
            'language' => 'javascript',
            'template' => '// hi',
            'line_numbers' => '1',
            'line_wrapping' => '1',
            'required' => '0',
        ],
    ])->assertRedirect();

    $this->patch(route('collections.fields.update', [$collection, $tag]), [
        'settings' => [
            'presets' => 'a, b, c',
            'separator' => '|',
            'allow_other' => '1',
            'lowercase' => '1',
            'alphabetize' => '1',
            'required' => '0',
        ],
    ])->assertRedirect();

    expect($number->fresh()->settings['min'])->toBe(1)
        ->and($number->fresh()->settings['max'])->toBe(99)
        ->and($number->fresh()->settings['step'])->toBe(2)
        ->and($code->fresh()->settings['language'])->toBe('javascript')
        ->and($code->fresh()->settings['template'])->toBe('// hi')
        ->and($code->fresh()->settings['line_numbers'] ?? null)->not->toBeNull()
        ->and($tag->fresh()->settings['separator'])->toBe('|')
        ->and($tag->fresh()->settings['allow_other'] ?? null)->not->toBeNull();
});

test('string field max length validation rule is enforced', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'summary',
        'type' => FieldTypeEnum::String,
        'settings' => [
            'validation_rules' => [
                ['operator' => 'max_length', 'value' => 5],
            ],
        ],
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => ['summary' => 'too-long-value'],
    ])->assertSessionHasErrors('data.summary');
});

test('string field unique validation rule is enforced', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'code',
        'type' => FieldTypeEnum::String,
        'settings' => [
            'validation_rules' => [
                ['operator' => 'unique'],
            ],
        ],
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => ['code' => 'ABC123'],
    ])->assertRedirect();

    $this->post(route('collections.items.store', $collection), [
        'data' => ['code' => 'ABC123'],
    ])->assertSessionHasErrors('data.code');
});

test('readonly field value cannot be overwritten on item update', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'locked_title',
        'type' => FieldTypeEnum::String,
        'settings' => ['readonly' => true],
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => ['locked_title' => 'Original'],
    ])->assertRedirect();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->first();

    $this->put(route('collections.items.update', [$collection, $item]), [
        'data' => ['locked_title' => 'Changed'],
    ])->assertRedirect();

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item->fresh());
    expect($assembled['locked_title'])->toBe('Original');
});

test('select field rejects values outside options when allow_other is false', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'type' => FieldTypeEnum::Select,
        'settings' => [
            'allow_other' => false,
            'options' => [
                ['value' => 'draft', 'label' => 'Draft'],
                ['value' => 'published', 'label' => 'Published'],
            ],
        ],
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => ['status' => 'invalid'],
    ])->assertSessionHasErrors('data.status');

    $this->post(route('collections.items.store', $collection), [
        'data' => ['status' => 'draft'],
    ])->assertRedirect();
});

test('default value is applied on item create when field is omitted', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'subtitle',
        'type' => FieldTypeEnum::String,
        'settings' => ['default_value' => 'Default subtitle'],
    ]);

    $response = $this->post(route('collections.items.store', $collection), [
        'data' => [],
    ]);

    $response->assertRedirect()->assertSessionHasNoErrors();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->first();
    expect($item)->not->toBeNull();
    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item);
    expect($assembled['subtitle'])->toBe('Default subtitle');
});

test('many to one relation value is saved and assembled', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $authors = Collection::factory()->create(['slug' => 'authors']);
    CollectionField::factory()->create([
        'collection_id' => $authors->id,
        'name' => 'name',
        'type' => FieldTypeEnum::String,
    ]);

    $authorItem = CollectionItem::factory()->create(['collection_id' => $authors->id]);
    app(CollectionItemValuesWriter::class)->sync(
        $authorItem,
        $authors,
        app(CollectionItemDataNormalizer::class)->normalize($authors, ['name' => 'Jane Doe']),
    );

    $posts = Collection::factory()->create(['slug' => 'posts']);
    CollectionField::factory()->create([
        'collection_id' => $posts->id,
        'name' => 'author',
        'type' => FieldTypeEnum::ManyToOne,
        'settings' => [
            'related_collection_id' => $authors->id,
            'display_field' => 'name',
        ],
    ]);

    $this->post(route('collections.items.store', $posts), [
        'data' => ['author' => $authorItem->id],
    ])->assertRedirect();

    $postItem = CollectionItem::query()->where('collection_id', $posts->id)->first();
    expect($postItem)->not->toBeNull();

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($postItem);
    expect($assembled['author'])->toBe($authorItem->id);
});

test('many to many relation values are saved as array storage rows', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $tags = Collection::factory()->create(['slug' => 'tags']);
    $firstTag = CollectionItem::factory()->create(['collection_id' => $tags->id]);
    $secondTag = CollectionItem::factory()->create(['collection_id' => $tags->id]);

    $articles = Collection::factory()->create(['slug' => 'articles']);
    $field = CollectionField::factory()->create([
        'collection_id' => $articles->id,
        'name' => 'related_tags',
        'type' => FieldTypeEnum::ManyToMany,
        'settings' => ['related_collection_id' => $tags->id],
    ]);

    $this->post(route('collections.items.store', $articles), [
        'data' => ['related_tags' => [$firstTag->id, $secondTag->id]],
    ])->assertRedirect();

    $article = CollectionItem::query()->where('collection_id', $articles->id)->first();
    expect($article)->not->toBeNull();

    $rows = CollectionItemValue::query()
        ->where('item_id', $article->id)
        ->where('field_id', $field->id)
        ->orderBy('position')
        ->get();

    expect($rows)->toHaveCount(2);
    expect($rows->pluck('value')->all())->toBe([
        ['related_item_id' => $firstTag->id, 'meta' => []],
        ['related_item_id' => $secondTag->id, 'meta' => []],
    ]);

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($article);
    expect($assembled['related_tags'])->toBe([
        ['related_item_id' => $firstTag->id, 'meta' => []],
        ['related_item_id' => $secondTag->id, 'meta' => []],
    ]);
});

test('many to many accepts junction metadata objects', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $tags = Collection::factory()->create(['slug' => 'tags-meta']);
    $tag = CollectionItem::factory()->create(['collection_id' => $tags->id]);

    $articles = Collection::factory()->create(['slug' => 'articles-meta']);
    CollectionField::factory()->create([
        'collection_id' => $articles->id,
        'name' => 'related_tags',
        'type' => FieldTypeEnum::ManyToMany,
        'settings' => [
            'related_collection_id' => $tags->id,
            'junction_fields' => [
                ['name' => 'sort', 'type' => 'number'],
            ],
        ],
    ]);

    $this->post(route('collections.items.store', $articles), [
        'data' => [
            'related_tags' => [
                ['related_item_id' => $tag->id, 'meta' => ['sort' => 1]],
            ],
        ],
    ])->assertRedirect();

    $article = CollectionItem::query()->where('collection_id', $articles->id)->firstOrFail();
    $assembled = app(CollectionItemValuesAssembler::class)->assemble($article);
    expect($assembled['related_tags'])->toBe([
        ['related_item_id' => $tag->id, 'meta' => ['sort' => 1]],
    ]);
});

test('m2a blocks are saved and assembled in order', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $blocks = Collection::factory()->create(['slug' => 'blocks']);
    $pages = Collection::factory()->create(['slug' => 'pages']);

    $blockItem = CollectionItem::factory()->create(['collection_id' => $blocks->id]);
    $pageItem = CollectionItem::factory()->create(['collection_id' => $pages->id]);

    $builder = Collection::factory()->create(['slug' => 'builder']);
    $field = CollectionField::factory()->create([
        'collection_id' => $builder->id,
        'name' => 'content',
        'type' => FieldTypeEnum::M2a,
        'settings' => [
            'allowed_collection_ids' => [$blocks->id, $pages->id],
        ],
    ]);

    $this->post(route('collections.items.store', $builder), [
        'data' => [
            'content' => [
                [
                    'related_collection_id' => $blocks->id,
                    'related_item_id' => $blockItem->id,
                ],
                [
                    'related_collection_id' => $pages->id,
                    'related_item_id' => $pageItem->id,
                ],
            ],
        ],
    ])->assertRedirect();

    $entry = CollectionItem::query()->where('collection_id', $builder->id)->first();
    expect($entry)->not->toBeNull();

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($entry);
    expect($assembled['content'])->toBe([
        [
            'related_collection_id' => $blocks->id,
            'related_item_id' => $blockItem->id,
        ],
        [
            'related_collection_id' => $pages->id,
            'related_item_id' => $pageItem->id,
        ],
    ]);

    expect(
        CollectionItemValue::query()
            ->where('item_id', $entry->id)
            ->where('field_id', $field->id)
            ->count(),
    )->toBe(2);
});

test('blocks field type settings are normalized and saved', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'content',
        'type' => FieldTypeEnum::Blocks->value,
        'translatable' => '1',
        'settings' => [
            'block_types' => [
                [
                    'key' => 'Rich Text',
                    'label' => 'Rich text',
                    'fields' => [
                        ['name' => 'Title', 'type' => 'string', 'translatable' => '1', 'settings' => []],
                        ['name' => 'secret', 'type' => 'hash', 'translatable' => '1', 'settings' => []],
                    ],
                ],
            ],
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    $field = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'content')
        ->firstOrFail();

    expect($field->translatable)->toBeFalse()
        ->and($field->settings['block_types'][0]['key'])->toBe('rich_text')
        ->and($field->settings['block_types'][0]['fields'][0]['name'])->toBe('title')
        ->and($field->settings['block_types'][0]['fields'][1]['translatable'])->toBeFalse();
});

test('blocks field values are saved and assembled in order', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['slug' => 'articles']);
    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'content',
        'type' => FieldTypeEnum::Blocks,
        'settings' => [
            'block_types' => [
                [
                    'key' => 'rich_text',
                    'label' => 'Rich text',
                    'fields' => [
                        ['name' => 'title', 'type' => 'string', 'translatable' => true, 'settings' => []],
                        ['name' => 'body', 'type' => 'wysiwyg', 'translatable' => true, 'settings' => []],
                    ],
                ],
                [
                    'key' => 'media',
                    'label' => 'Media',
                    'fields' => [
                        ['name' => 'image', 'type' => 'image', 'settings' => []],
                        ['name' => 'caption', 'type' => 'string', 'translatable' => true, 'settings' => []],
                    ],
                ],
            ],
        ],
    ]);

    $image = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'hero.jpg',
        'path' => '/hero.jpg',
        'disk' => 'assets',
        'storage_path' => '2026/hero.jpg',
    ]);

    $payload = [
        'content' => [
            [
                'id' => '11111111-1111-1111-1111-111111111111',
                'type' => 'rich_text',
                'data' => [
                    'title' => ['en' => 'Hello', 'it' => 'Ciao'],
                    'body' => ['en' => '<p>Body</p>'],
                ],
            ],
            [
                'id' => '22222222-2222-2222-2222-222222222222',
                'type' => 'media',
                'data' => [
                    'image' => $image->id,
                    'caption' => ['en' => 'Hero image'],
                ],
            ],
        ],
    ];

    $this->post(route('collections.items.store', $collection), ['data' => $payload])->assertRedirect();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->firstOrFail();
    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item);

    expect($assembled['content'])->toBe($payload['content']);
    expect(
        CollectionItemValue::query()
            ->where('item_id', $item->id)
            ->where('field_id', $field->id)
            ->count()
    )->toBe(2);
});

test('blocks field update replaces blocks instead of appending', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['slug' => 'articles-update']);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'content',
        'type' => FieldTypeEnum::Blocks,
        'settings' => [
            'block_types' => [
                [
                    'key' => 'rich_text',
                    'label' => 'Rich text',
                    'fields' => [
                        ['name' => 'title', 'type' => 'string', 'settings' => []],
                    ],
                ],
            ],
        ],
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => [
            'content' => [
                [
                    'id' => '11111111-1111-1111-1111-111111111111',
                    'type' => 'rich_text',
                    'data' => ['title' => 'One'],
                ],
                [
                    'id' => '22222222-2222-2222-2222-222222222222',
                    'type' => 'rich_text',
                    'data' => ['title' => 'Two'],
                ],
            ],
        ],
    ])->assertRedirect();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->firstOrFail();

    $this->put(route('collections.items.update', [$collection, $item]), [
        'data' => [
            'content' => [
                [
                    'id' => '33333333-3333-3333-3333-333333333333',
                    'type' => 'rich_text',
                    'data' => ['title' => 'Only'],
                ],
            ],
        ],
    ])->assertRedirect();

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item->fresh());

    expect($assembled['content'])->toHaveCount(1)
        ->and($assembled['content'][0]['id'])->toBe('33333333-3333-3333-3333-333333333333')
        ->and($assembled['content'][0]['data']['title'])->toBe('Only');
});

test('blocks field rejects unknown block type and invalid nested data', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'content',
        'type' => FieldTypeEnum::Blocks,
        'settings' => [
            'block_types' => [
                [
                    'key' => 'media',
                    'label' => 'Media',
                    'fields' => [
                        ['name' => 'image', 'type' => 'image', 'settings' => []],
                    ],
                ],
            ],
        ],
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => [
            'content' => [
                [
                    'id' => '11111111-1111-1111-1111-111111111111',
                    'type' => 'missing',
                    'data' => [],
                ],
            ],
        ],
    ])->assertSessionHasErrors('data.content');

    $this->post(route('collections.items.store', $collection), [
        'data' => [
            'content' => [
                [
                    'id' => '11111111-1111-1111-1111-111111111111',
                    'type' => 'media',
                    'data' => ['image' => 'oops'],
                ],
            ],
        ],
    ])->assertSessionHasErrors();
});

test('nested blocks inside block types are saved and assembled', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['slug' => 'articles-nested']);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'body',
        'type' => FieldTypeEnum::Blocks,
        'settings' => [
            'block_types' => [
                [
                    'key' => 'rich_text',
                    'label' => 'Rich text',
                    'fields' => [
                        ['name' => 'title', 'type' => 'string', 'settings' => []],
                    ],
                ],
                [
                    'key' => 'section',
                    'label' => 'Section',
                    'fields' => [
                        ['name' => 'heading', 'type' => 'string', 'settings' => []],
                        [
                            'name' => 'blocks',
                            'type' => 'blocks',
                            'settings' => [
                                'block_types' => [
                                    [
                                        'key' => 'rich_text',
                                        'label' => 'Rich text',
                                        'fields' => [
                                            ['name' => 'body', 'type' => 'wysiwyg', 'settings' => []],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $payload = [
        'body' => [
            [
                'id' => '11111111-1111-1111-1111-111111111111',
                'type' => 'rich_text',
                'data' => ['title' => 'Intro'],
            ],
            [
                'id' => '22222222-2222-2222-2222-222222222222',
                'type' => 'section',
                'data' => [
                    'heading' => 'Chapter',
                    'blocks' => [
                        [
                            'id' => '33333333-3333-3333-3333-333333333333',
                            'type' => 'rich_text',
                            'data' => ['body' => '<p>Nested</p>'],
                        ],
                    ],
                ],
            ],
        ],
    ];

    $this->post(route('collections.items.store', $collection), ['data' => $payload])->assertRedirect();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->firstOrFail();
    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item);

    expect($assembled['body'])->toHaveCount(2)
        ->and($assembled['body'][0]['data']['title'])->toBe('Intro')
        ->and($assembled['body'][1]['type'])->toBe('section')
        ->and($assembled['body'][1]['data']['blocks'])->toHaveCount(1)
        ->and($assembled['body'][1]['data']['blocks'][0]['data']['body'])->toBe('<p>Nested</p>');
});

test('blocks field settings accept depth three nesting by default', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'body',
        'type' => FieldTypeEnum::Blocks->value,
        'settings' => [
            'block_types' => [
                [
                    'key' => 'section',
                    'label' => 'Section',
                    'fields' => [
                        [
                            'name' => 'blocks',
                            'type' => 'blocks',
                            'translatable' => '0',
                            'settings' => [
                                'block_types' => [
                                    [
                                        'key' => 'column',
                                        'label' => 'Column',
                                        'fields' => [
                                            [
                                                'name' => 'blocks',
                                                'type' => 'blocks',
                                                'translatable' => '0',
                                                'settings' => [
                                                    'block_types' => [
                                                        [
                                                            'key' => 'rich_text',
                                                            'label' => 'Rich text',
                                                            'fields' => [
                                                                ['name' => 'title', 'type' => 'string', 'settings' => []],
                                                            ],
                                                        ],
                                                    ],
                                                ],
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    $field = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'body')
        ->firstOrFail();

    expect($field->settings['max_blocks_depth'])->toBe(3);

    $depth3Fields = $field->settings['block_types'][0]['fields'][0]['settings']['block_types'][0]['fields'][0]['settings']['block_types'][0]['fields'];
    expect(array_column($depth3Fields, 'type'))->toContain('string');
});

test('blocks field settings strip blocks nesting beyond max depth', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'body',
        'type' => FieldTypeEnum::Blocks->value,
        'settings' => [
            'max_blocks_depth' => 3,
            'block_types' => [
                [
                    'key' => 'section',
                    'label' => 'Section',
                    'fields' => [
                        [
                            'name' => 'blocks',
                            'type' => 'blocks',
                            'translatable' => '0',
                            'settings' => [
                                'block_types' => [
                                    [
                                        'key' => 'column',
                                        'label' => 'Column',
                                        'fields' => [
                                            [
                                                'name' => 'blocks',
                                                'type' => 'blocks',
                                                'translatable' => '0',
                                                'settings' => [
                                                    'block_types' => [
                                                        [
                                                            'key' => 'inner',
                                                            'label' => 'Inner',
                                                            'fields' => [
                                                                [
                                                                    'name' => 'deeper',
                                                                    'type' => 'blocks',
                                                                    'translatable' => '0',
                                                                    'settings' => [
                                                                        'block_types' => [
                                                                            [
                                                                                'key' => 'too_deep',
                                                                                'label' => 'Too deep',
                                                                                'fields' => [
                                                                                    ['name' => 'title', 'type' => 'string', 'settings' => []],
                                                                                ],
                                                                            ],
                                                                        ],
                                                                    ],
                                                                ],
                                                                ['name' => 'title', 'type' => 'string', 'settings' => []],
                                                            ],
                                                        ],
                                                    ],
                                                ],
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    $field = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'body')
        ->firstOrFail();

    expect($field->settings['max_blocks_depth'])->toBe(3);

    // depth 3 leaf: inner fields — blocks stripped, string kept
    $innerFields = $field->settings['block_types'][0]['fields'][0]['settings']['block_types'][0]['fields'][0]['settings']['block_types'][0]['fields'];
    $types = array_column($innerFields, 'type');

    expect($types)->toContain('string')
        ->and($types)->not->toContain('blocks');
});

test('blocks field settings clamp max_blocks_depth to ceiling five', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'body',
        'type' => FieldTypeEnum::Blocks->value,
        'settings' => [
            'max_blocks_depth' => 99,
            'block_types' => [
                [
                    'key' => 'rich_text',
                    'label' => 'Rich text',
                    'fields' => [
                        ['name' => 'title', 'type' => 'string', 'settings' => []],
                    ],
                ],
            ],
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    $field = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'body')
        ->firstOrFail();

    expect($field->settings['max_blocks_depth'])->toBe(5);
});

test('nested m2a inside blocks is saved and assembled', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $modules = Collection::factory()->create(['slug' => 'modules']);
    $moduleItem = CollectionItem::factory()->create(['collection_id' => $modules->id]);

    $articles = Collection::factory()->create(['slug' => 'articles-nested-m2a']);
    CollectionField::factory()->create([
        'collection_id' => $articles->id,
        'name' => 'body',
        'type' => FieldTypeEnum::Blocks,
        'settings' => [
            'max_blocks_depth' => 3,
            'block_types' => [
                [
                    'key' => 'related_modules',
                    'label' => 'Related modules',
                    'fields' => [
                        ['name' => 'heading', 'type' => 'string', 'settings' => []],
                        [
                            'name' => 'modules',
                            'type' => 'm2a',
                            'settings' => [
                                'allowed_collection_ids' => [$modules->id],
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $payload = [
        'body' => [
            [
                'id' => 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                'type' => 'related_modules',
                'data' => [
                    'heading' => 'Reuse',
                    'modules' => [
                        [
                            'related_collection_id' => $modules->id,
                            'related_item_id' => $moduleItem->id,
                        ],
                    ],
                ],
            ],
        ],
    ];

    $this->post(route('collections.items.store', $articles), ['data' => $payload])->assertRedirect();

    $item = CollectionItem::query()->where('collection_id', $articles->id)->firstOrFail();
    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item);

    expect($assembled['body'])->toHaveCount(1)
        ->and($assembled['body'][0]['data']['heading'])->toBe('Reuse')
        ->and($assembled['body'][0]['data']['modules'])->toBe([
            [
                'related_collection_id' => $modules->id,
                'related_item_id' => $moduleItem->id,
            ],
        ]);
});

test('blocks field settings accept nested m2a type', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $modules = Collection::factory()->create(['slug' => 'reusable-modules']);
    $collection = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'body',
        'type' => FieldTypeEnum::Blocks->value,
        'settings' => [
            'block_types' => [
                [
                    'key' => 'related_modules',
                    'label' => 'Related modules',
                    'fields' => [
                        [
                            'name' => 'modules',
                            'type' => 'm2a',
                            'translatable' => '0',
                            'settings' => [
                                'allowed_collection_ids' => [$modules->id],
                                'allow_duplicates' => '1',
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    $field = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'body')
        ->firstOrFail();

    $nested = $field->settings['block_types'][0]['fields'][0];
    expect($nested['type'])->toBe('m2a')
        ->and($nested['settings']['allowed_collection_ids'])->toBe([$modules->id]);
});

test('nested m2m inside blocks is saved as json links not junction rows', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $related = Collection::factory()->create(['slug' => 'related-articles']);
    $relatedItem = CollectionItem::factory()->create(['collection_id' => $related->id]);

    $articles = Collection::factory()->create(['slug' => 'articles-nested-m2m']);
    CollectionField::factory()->create([
        'collection_id' => $articles->id,
        'name' => 'body',
        'type' => FieldTypeEnum::Blocks,
        'settings' => [
            'block_types' => [
                [
                    'key' => 'related_articles',
                    'label' => 'Related articles',
                    'fields' => [
                        [
                            'name' => 'articles',
                            'type' => 'many_to_many',
                            'settings' => [
                                'related_collection_id' => $related->id,
                                'display_field' => 'title',
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $payload = [
        'body' => [
            [
                'id' => 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                'type' => 'related_articles',
                'data' => [
                    'articles' => [
                        [
                            'related_item_id' => $relatedItem->id,
                            'meta' => ['note' => 'featured'],
                        ],
                    ],
                ],
            ],
        ],
    ];

    $this->post(route('collections.items.store', $articles), ['data' => $payload])->assertRedirect();

    $item = CollectionItem::query()->where('collection_id', $articles->id)->firstOrFail();
    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item);

    expect($assembled['body'][0]['data']['articles'])->toBe([
        [
            'related_item_id' => $relatedItem->id,
            'meta' => ['note' => 'featured'],
        ],
    ]);
});

test('blocks field settings accept nested many_to_many and one_to_many', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $related = Collection::factory()->create();
    $collection = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'body',
        'type' => FieldTypeEnum::Blocks->value,
        'settings' => [
            'block_types' => [
                [
                    'key' => 'gallery_refs',
                    'label' => 'Gallery refs',
                    'fields' => [
                        [
                            'name' => 'articles',
                            'type' => 'many_to_many',
                            'translatable' => '0',
                            'settings' => [
                                'related_collection_id' => $related->id,
                            ],
                        ],
                        [
                            'name' => 'children',
                            'type' => 'one_to_many',
                            'translatable' => '0',
                            'settings' => [
                                'related_collection_id' => $related->id,
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    $field = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'body')
        ->firstOrFail();

    $types = array_column($field->settings['block_types'][0]['fields'], 'type');
    expect($types)->toContain('many_to_many')
        ->and($types)->toContain('one_to_many');
});

test('nested block field conditions hide and require against block siblings', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $articles = Collection::factory()->create(['slug' => 'articles-nested-conditions']);
    CollectionField::factory()->create([
        'collection_id' => $articles->id,
        'name' => 'body',
        'type' => FieldTypeEnum::Blocks,
        'settings' => [
            'block_types' => [
                [
                    'key' => 'media',
                    'label' => 'Media',
                    'fields' => [
                        [
                            'name' => 'media_kind',
                            'type' => 'select',
                            'settings' => [
                                'options' => [
                                    ['value' => 'image', 'label' => 'Image'],
                                    ['value' => 'video', 'label' => 'Video'],
                                ],
                            ],
                        ],
                        [
                            'name' => 'video_url',
                            'type' => 'string',
                            'settings' => [
                                'conditions' => [
                                    'logic' => 'and',
                                    'rules' => [
                                        [
                                            'field' => 'media_kind',
                                            'operator' => 'equals',
                                            'value' => 'video',
                                        ],
                                    ],
                                    'required' => true,
                                    'hidden' => false,
                                ],
                            ],
                        ],
                        [
                            'name' => 'caption',
                            'type' => 'string',
                            'settings' => [
                                'conditions' => [
                                    'logic' => 'and',
                                    'rules' => [
                                        [
                                            'field' => 'media_kind',
                                            'operator' => 'equals',
                                            'value' => 'image',
                                        ],
                                    ],
                                    'hidden' => true,
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    // video_url required when media_kind=video — missing should fail
    $this->post(route('collections.items.store', $articles), [
        'data' => [
            'body' => [
                [
                    'id' => 'cccccccc-cccc-cccc-cccc-cccccccccccc',
                    'type' => 'media',
                    'data' => [
                        'media_kind' => 'video',
                    ],
                ],
            ],
        ],
    ])->assertSessionHasErrors();

    // video present — ok; caption hidden when kind=video so not required
    $this->post(route('collections.items.store', $articles), [
        'data' => [
            'body' => [
                [
                    'id' => 'dddddddd-dddd-dddd-dddd-dddddddddddd',
                    'type' => 'media',
                    'data' => [
                        'media_kind' => 'video',
                        'video_url' => 'https://example.com/v.mp4',
                    ],
                ],
            ],
        ],
    ])->assertRedirect();

    $item = CollectionItem::query()->where('collection_id', $articles->id)->firstOrFail();
    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item);
    expect($assembled['body'][0]['data']['video_url'])->toBe('https://example.com/v.mp4');
});

test('blocks field settings persist nested field conditions', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'body',
        'type' => FieldTypeEnum::Blocks->value,
        'settings' => [
            'block_types' => [
                [
                    'key' => 'media',
                    'label' => 'Media',
                    'fields' => [
                        ['name' => 'media_kind', 'type' => 'string', 'settings' => []],
                        [
                            'name' => 'video_url',
                            'type' => 'string',
                            'translatable' => '0',
                            'settings' => [
                                'conditions' => [
                                    'logic' => 'and',
                                    'rules' => [
                                        [
                                            'field' => 'media_kind',
                                            'operator' => 'equals',
                                            'value' => 'video',
                                        ],
                                    ],
                                    'required' => true,
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));

    $field = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'body')
        ->firstOrFail();

    $videoSettings = collect($field->settings['block_types'][0]['fields'])
        ->firstWhere('name', 'video_url')['settings'];

    expect($videoSettings['conditions']['rules'][0]['field'])->toBe('media_kind')
        ->and($videoSettings['conditions']['required'])->toBeTrue();
});

test('files field stores multiple file ids', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $firstFile = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'one.txt',
        'path' => '/one.txt',
        'disk' => 'assets',
        'storage_path' => '2026/one.txt',
    ]);
    $secondFile = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'two.txt',
        'path' => '/two.txt',
        'disk' => 'assets',
        'storage_path' => '2026/two.txt',
    ]);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'attachments',
        'type' => FieldTypeEnum::Files,
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => ['attachments' => [$firstFile->id, $secondFile->id]],
    ])->assertRedirect();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->first();
    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item);
    expect($assembled['attachments'])->toBe([$firstFile->id, $secondFile->id]);
});

test('relation options endpoint supports display template and filter', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $related = Collection::factory()->create(['slug' => 'related-items']);
    CollectionField::factory()->create([
        'collection_id' => $related->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $related->id,
        'name' => 'status',
        'type' => FieldTypeEnum::Select,
        'settings' => [
            'options' => [
                ['value' => 'draft', 'label' => 'Draft'],
                ['value' => 'published', 'label' => 'Published'],
            ],
        ],
    ]);

    $published = CollectionItem::factory()->create(['collection_id' => $related->id]);
    app(CollectionItemValuesWriter::class)->sync(
        $published,
        $related,
        app(CollectionItemDataNormalizer::class)->normalize($related, [
            'title' => 'Visible item',
            'status' => 'published',
        ]),
    );

    $draft = CollectionItem::factory()->create(['collection_id' => $related->id]);
    app(CollectionItemValuesWriter::class)->sync(
        $draft,
        $related,
        app(CollectionItemDataNormalizer::class)->normalize($related, [
            'title' => 'Hidden item',
            'status' => 'draft',
        ]),
    );

    $host = Collection::factory()->create(['slug' => 'host']);
    $relationField = CollectionField::factory()->create([
        'collection_id' => $host->id,
        'name' => 'linked',
        'type' => FieldTypeEnum::ManyToOne,
        'settings' => [
            'related_collection_id' => $related->id,
            'display_field' => 'title',
            'display_template' => '{{title}} ({{status}})',
            'filter' => ['status' => 'published'],
        ],
    ]);

    $response = $this->getJson(route('collections.items.field-options', [
        'collection' => $host->id,
        'field_id' => $relationField->id,
    ]));

    $response->assertOk();
    expect(collect($response->json('data'))->pluck('id')->all())->toBe([$published->id]);
    expect($response->json('data.0.label'))->toBe('Visible item (published)');
});

test('checkbox group tree leaf combining keeps only leaf values on save', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'categories',
        'type' => FieldTypeEnum::CheckboxGroupTree,
        'settings' => [
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
        ],
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => ['categories' => ['root', 'leaf-a']],
    ])->assertRedirect();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->first();
    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item);
    expect($assembled['categories'])->toBe(['leaf-a']);
});

test('tag field lowercase and alphabetize settings are applied on save', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'keywords',
        'type' => FieldTypeEnum::Tag,
        'settings' => [
            'lowercase' => true,
            'alphabetize' => true,
        ],
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => ['keywords' => ['Beta', 'alpha']],
    ])->assertRedirect();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->first();
    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item);
    expect($assembled['keywords'])->toBe(['alpha', 'beta']);
});

test('deleting a collection soft deletes it and its items from the active index', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    $this->delete(route('collections.destroy', $collection))
        ->assertRedirect(route('collections.index'));

    $this->assertSoftDeleted($collection);
    $this->assertSoftDeleted($item);

    $this->get(route('collections.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/collections/index')
            ->has('collections', 0)
            ->where('filters.trashed', false));
});

test('trashed collections filter only shows soft deleted collections', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    Collection::factory()->create();
    $trashedCollection = Collection::factory()->create();
    $trashedCollection->delete();

    $this->get(route('collections.index', ['trashed' => 1]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/collections/index')
            ->has('collections', 1)
            ->where('collections.0.id', $trashedCollection->id)
            ->where('filters.trashed', true));
});

test('collections index can be searched by name or slug', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $match = Collection::factory()->create([
        'name' => 'Alpha Pages',
        'slug' => 'alpha-pages',
    ]);
    Collection::factory()->create([
        'name' => 'Beta Posts',
        'slug' => 'beta-posts',
    ]);

    $this->get(route('collections.index', ['search' => 'alpha']))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/collections/index')
            ->has('collections', 1)
            ->where('collections.0.id', $match->id)
            ->where('filters.search', 'alpha'));

    $this->get(route('collections.index', ['search' => 'beta-posts']))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/collections/index')
            ->has('collections', 1)
            ->where('collections.0.slug', 'beta-posts'));
});

test('collections index can be sorted by name slug status and updated_at', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $zebra = Collection::factory()->create([
        'name' => 'Zebra',
        'slug' => 'zebra',
        'status' => 'inactive',
        'updated_at' => now()->subDay(),
    ]);
    $alpha = Collection::factory()->create([
        'name' => 'Alpha',
        'slug' => 'alpha',
        'status' => 'active',
        'updated_at' => now(),
    ]);

    $this->get(route('collections.index', [
        'sort' => 'name',
        'direction' => 'asc',
    ]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/collections/index')
            ->where('collections.0.id', $alpha->id)
            ->where('collections.1.id', $zebra->id)
            ->where('filters.sort', 'name')
            ->where('filters.direction', 'asc'));

    $this->get(route('collections.index', [
        'sort' => 'slug',
        'direction' => 'desc',
    ]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/collections/index')
            ->where('collections.0.id', $zebra->id)
            ->where('collections.1.id', $alpha->id)
            ->where('filters.sort', 'slug')
            ->where('filters.direction', 'desc'));

    $this->get(route('collections.index', [
        'sort' => 'status',
        'direction' => 'asc',
    ]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/collections/index')
            ->where('collections.0.id', $alpha->id)
            ->where('collections.1.id', $zebra->id)
            ->where('filters.sort', 'status')
            ->where('filters.direction', 'asc'));

    $this->get(route('collections.index', [
        'sort' => 'updated_at',
        'direction' => 'desc',
    ]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/collections/index')
            ->where('collections.0.id', $alpha->id)
            ->where('filters.sort', 'updated_at')
            ->where('filters.direction', 'desc'));
});

test('restoring a collection restores its soft deleted items', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    $collection->delete();

    $this->post(route('collections.restore', $collection))
        ->assertRedirect(route('collections.index', ['trashed' => 1]));

    expect($collection->fresh())->not->toBeNull()
        ->and($item->fresh())->not->toBeNull();
});

test('force deleting a collection permanently removes it and its items', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    $collection->delete();

    $this->delete(route('collections.force-delete', $collection))
        ->assertRedirect(route('collections.index', ['trashed' => 1]));

    expect(Collection::query()->withTrashed()->find($collection->id))->toBeNull()
        ->and(CollectionItem::query()->withTrashed()->find($item->id))->toBeNull();
});

test('collection items can be restored and force deleted', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    $item->delete();

    $this->get(route('collections.items.index', [
        'collection' => $collection,
        'trashed' => 1,
    ]))->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/items/index')
            ->has('items.data', 1)
            ->where('items.data.0.id', $item->id)
            ->where('filters.trashed', true));

    $this->post(route('collections.items.restore', [$collection, $item]))
        ->assertRedirect(route('collections.items.index', [
            'collection' => $collection,
            'trashed' => 1,
        ]));

    expect($item->fresh())->not->toBeNull();

    $item->delete();

    $this->delete(route('collections.items.force-delete', [$collection, $item]))
        ->assertRedirect(route('collections.items.index', [
            'collection' => $collection,
            'trashed' => 1,
        ]));

    expect(CollectionItem::query()->withTrashed()->find($item->id))->toBeNull();
});

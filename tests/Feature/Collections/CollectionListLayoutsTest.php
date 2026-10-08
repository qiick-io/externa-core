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
use App\Support\Http\SafeReturnUrl;
use Database\Seeders\PermissionSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
});

test('safe return url accepts only relative collections paths', function () {
    expect(SafeReturnUrl::from('/collections/1/items'))->toBe('/collections/1/items');
    expect(SafeReturnUrl::from('/collections/1/items?layout=kanban'))->toBe('/collections/1/items?layout=kanban');
    expect(SafeReturnUrl::from('https://evil.test/collections/1'))->toBeNull();
    expect(SafeReturnUrl::from('/admin/users'))->toBeNull();
    expect(SafeReturnUrl::from('/collections/../etc/passwd'))->toBeNull();
});

test('put list-columns persists layout and field prefs', function () {
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
        'type' => FieldTypeEnum::Select,
        'settings' => [
            'options' => [
                ['value' => 'todo', 'label' => 'Todo'],
                ['value' => 'done', 'label' => 'Done'],
            ],
        ],
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'publish_on',
        'type' => FieldTypeEnum::Date,
        'settings' => ['date_mode' => 'date'],
    ]);

    $this->from(route('collections.items.index', $collection))
        ->put(route('collections.items.list-columns.update', $collection), [
            'columns' => ['id', 'title'],
            'aligns' => [],
            'layout' => 'kanban',
            'kanban_field' => 'status',
            'calendar_field' => 'publish_on',
        ])
        ->assertRedirect();

    $repo = app(SettingsRepository::class);
    expect($repo->get(
        SettingsRepository::SCOPE_USER,
        'collection_list',
        'collection_'.$collection->id.'_layout',
        $user->id,
    ))->toBe('kanban');
    expect($repo->get(
        SettingsRepository::SCOPE_USER,
        'collection_list',
        'collection_'.$collection->id.'_kanban_field',
        $user->id,
    ))->toBe('status');
    expect($repo->get(
        SettingsRepository::SCOPE_USER,
        'collection_list',
        'collection_'.$collection->id.'_calendar_field',
        $user->id,
    ))->toBe('publish_on');
});

test('items index exposes list layout props', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => false]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'type' => FieldTypeEnum::Select,
        'settings' => [
            'options' => [
                ['value' => 'todo', 'label' => 'Todo'],
            ],
        ],
    ]);

    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_USER,
        'collection_list',
        'collection_'.$collection->id.'_layout',
        'kanban',
        $user->id,
    );
    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_USER,
        'collection_list',
        'collection_'.$collection->id.'_kanban_field',
        'status',
        $user->id,
    );

    $this->get(route('collections.items.index', $collection))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('collections/items/index')
            ->where('list_layout', 'kanban')
            ->where('kanban_field', 'status'));
});

test('kanban field update redirects back to list via safe return', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => false]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'type' => FieldTypeEnum::Select,
        'settings' => [
            'options' => [
                ['value' => 'todo', 'label' => 'Todo'],
                ['value' => 'done', 'label' => 'Done'],
            ],
        ],
    ]);

    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
    ]);
    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer->sync(
        $item,
        $collection,
        $normalizer->normalize($collection, ['status' => 'todo']),
    );

    $listUrl = route('collections.items.index', $collection, false);

    $this->put(route('collections.items.update', [$collection, $item]), [
        'data' => ['status' => 'done'],
        'save_action' => 'stay',
        'return' => $listUrl,
    ])->assertRedirect($listUrl);

    $item->refresh();
    $data = app(CollectionItemValuesAssembler::class)->assemble($item);
    expect($data['status'] ?? null)->toBe('done');
});

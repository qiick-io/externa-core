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

test('kanban index seeds per-column first page with totals', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => false]);
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
                ['value' => 'doing', 'label' => 'Doing'],
                ['value' => 'done', 'label' => 'Done'],
            ],
        ],
    ]);

    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $statuses = array_merge(
        array_fill(0, 35, 'todo'),
        array_fill(0, 10, 'doing'),
        array_fill(0, 5, 'done'),
    );
    foreach ($statuses as $index => $status) {
        $item = CollectionItem::factory()->create([
            'collection_id' => $collection->id,
        ]);
        $writer->sync(
            $item,
            $collection,
            $normalizer->normalize($collection, [
                'title' => 'Card '.$index,
                'status' => $status,
            ]),
        );
    }

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
            ->where('kanban.field', 'status')
            ->where('kanban.per_page', 30)
            ->where('kanban.columns.0.value', 'todo')
            ->where('kanban.columns.0.total', 35)
            ->where('kanban.columns.0.last_page', 2)
            ->has('kanban.columns.0.items', 30)
            ->where('kanban.columns.1.total', 10)
            ->has('kanban.columns.1.items', 10)
            ->where('kanban.columns.2.total', 5)
            ->has('items.data', 0));
});

test('kanban column endpoint paginates one column with filters', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => false]);
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

    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    foreach (range(1, 32) as $index) {
        $item = CollectionItem::factory()->create([
            'collection_id' => $collection->id,
        ]);
        $writer->sync(
            $item,
            $collection,
            $normalizer->normalize($collection, [
                'title' => ($index <= 2 ? 'Alpha ' : 'Beta ').$index,
                'status' => 'todo',
            ]),
        );
    }
    $done = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
    ]);
    $writer->sync(
        $done,
        $collection,
        $normalizer->normalize($collection, [
            'title' => 'Done item',
            'status' => 'done',
        ]),
    );

    $page1 = $this->getJson(route('collections.items.kanban-column', [
        'collection' => $collection,
        'field' => 'status',
        'value' => 'todo',
        'per_page' => 30,
        'page' => 1,
    ]))->assertOk()->json();

    expect($page1['total'])->toBe(32)
        ->and($page1['last_page'])->toBe(2)
        ->and($page1['data'])->toHaveCount(30);

    $page2 = $this->getJson(route('collections.items.kanban-column', [
        'collection' => $collection,
        'field' => 'status',
        'value' => 'todo',
        'per_page' => 30,
        'page' => 2,
    ]))->assertOk()->json();

    expect($page2['data'])->toHaveCount(2);

    $filtered = $this->getJson(route('collections.items.kanban-column', [
        'collection' => $collection,
        'field' => 'status',
        'value' => 'todo',
        'filter' => ['title' => 'Alpha'],
        'per_page' => 30,
    ]))->assertOk()->json();

    expect($filtered['total'])->toBe(2)
        ->and($filtered['data'])->toHaveCount(2);
});

test('calendar index seeds visible month items by date field', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => false]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'publish_on',
        'type' => FieldTypeEnum::Date,
        'settings' => ['date_mode' => 'date'],
    ]);

    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);

    $inMonth = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    $writer->sync(
        $inMonth,
        $collection,
        $normalizer->normalize($collection, [
            'title' => 'October event',
            'publish_on' => '2026-10-15',
        ]),
    );

    $outMonth = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    $writer->sync(
        $outMonth,
        $collection,
        $normalizer->normalize($collection, [
            'title' => 'December event',
            'publish_on' => '2026-12-01',
        ]),
    );

    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_USER,
        'collection_list',
        'collection_'.$collection->id.'_layout',
        'calendar',
        $user->id,
    );
    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_USER,
        'collection_list',
        'collection_'.$collection->id.'_calendar_field',
        'publish_on',
        $user->id,
    );

    $this->get(route('collections.items.index', [
        'collection' => $collection,
        'calendar_month' => '2026-10',
    ]))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('collections/items/index')
            ->where('list_layout', 'calendar')
            ->where('calendar_field', 'publish_on')
            ->where('calendar.field', 'publish_on')
            ->where('calendar.month', '2026-10')
            ->where('calendar.total', 1)
            ->has('calendar.data', 1)
            ->where('calendar.data.0.data.title', 'October event')
            ->has('items.data', 0));
});

test('calendar month endpoint filters by date range and title', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => false]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'publish_on',
        'type' => FieldTypeEnum::Date,
        'settings' => ['date_mode' => 'date'],
    ]);

    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);

    foreach ([
        ['title' => 'Alpha early', 'publish_on' => '2026-10-01'],
        ['title' => 'Alpha mid', 'publish_on' => '2026-10-15'],
        ['title' => 'Beta mid', 'publish_on' => '2026-10-15'],
        ['title' => 'Alpha late', 'publish_on' => '2026-11-01'],
    ] as $row) {
        $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);
        $writer->sync($item, $collection, $normalizer->normalize($collection, $row));
    }

    $payload = $this->getJson(route('collections.items.calendar-month', [
        'collection' => $collection,
        'field' => 'publish_on',
        'from' => '2026-10-01',
        'to' => '2026-10-31',
        'filter' => ['title' => 'Alpha'],
    ]))->assertOk()->json();

    expect($payload['total'])->toBe(2)
        ->and($payload['data'])->toHaveCount(2)
        ->and(collect($payload['data'])->pluck('data.title')->all())
        ->toEqualCanonicalizing(['Alpha early', 'Alpha mid']);
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

test('calendar_move updates published date on versioned collection', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'is_singleton' => false,
        'versioning' => true,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'settings' => ['required' => true],
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'publish_on',
        'type' => FieldTypeEnum::Date,
        'settings' => ['date_mode' => 'date'],
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
            'title' => 'Required title stays',
            'publish_on' => '2026-10-11',
        ]),
    );

    $listUrl = route('collections.items.index', [
        'collection' => $collection,
        'layout' => 'calendar',
    ], false);

    // Payload omits required title — move rules must not demand full form.
    $this->put(route('collections.items.update', [$collection, $item]), [
        'data' => ['publish_on' => '2026-10-20'],
        'calendar_move' => true,
        'save_action' => 'stay',
        'return' => $listUrl,
    ])->assertRedirect($listUrl);

    $item->refresh();
    $data = app(CollectionItemValuesAssembler::class)->assemble($item);
    expect($data['publish_on'] ?? null)->toBe('2026-10-20')
        ->and($data['title'] ?? null)->toBe('Required title stays')
        ->and($item->draft_data)->toBeNull();
});

test('calendar_move keeps datetime clock and patches draft_data', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'is_singleton' => false,
        'versioning' => true,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'published_at',
        'type' => FieldTypeEnum::Date,
        'settings' => ['date_mode' => 'datetime'],
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
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
            'published_at' => '2026-10-11T14:30',
            'title' => 'Live',
        ]),
    );
    $item->draft_data = $normalizer->normalize($collection, [
        'published_at' => '2026-10-11T14:30',
        'title' => 'Draft title',
    ]);
    $item->save();

    $this->put(route('collections.items.update', [$collection, $item]), [
        'data' => ['published_at' => '2026-10-20'],
        'calendar_move' => true,
        'save_action' => 'stay',
        'return' => route('collections.items.index', $collection, false),
    ])->assertRedirect();

    $item->refresh();
    $published = app(CollectionItemValuesAssembler::class)->assemble($item);
    expect($published['published_at'] ?? null)->toBe('2026-10-20T14:30')
        ->and($item->draft_data['published_at'] ?? null)->toBe('2026-10-20T14:30')
        ->and($item->draft_data['title'] ?? null)->toBe('Draft title');
});

test('kanban board_move updates published status on versioned collection', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'is_singleton' => false,
        'versioning' => true,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'type' => FieldTypeEnum::Select,
        'settings' => [
            'options' => [
                ['value' => 'draft', 'label' => 'Draft'],
                ['value' => 'published', 'label' => 'Published'],
            ],
        ],
    ]);

    $above = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
        'board_sort' => 1000,
    ]);
    $below = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
        'board_sort' => 3000,
    ]);
    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
    ]);

    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer->sync($above, $collection, $normalizer->normalize($collection, ['status' => 'draft']));
    $writer->sync($below, $collection, $normalizer->normalize($collection, ['status' => 'draft']));
    $writer->sync($item, $collection, $normalizer->normalize($collection, ['status' => 'published']));

    $listUrl = route('collections.items.index', [
        'collection' => $collection,
        'layout' => 'kanban',
    ], false);

    $this->put(route('collections.items.update', [$collection, $item]), [
        'data' => ['status' => 'draft'],
        'board_move' => true,
        'after_item_id' => $above->id,
        'before_item_id' => $below->id,
        'save_action' => 'stay',
        'return' => $listUrl,
    ])->assertRedirect($listUrl);

    $item->refresh();
    $data = app(CollectionItemValuesAssembler::class)->assemble($item);
    expect($data['status'] ?? null)->toBe('draft')
        ->and($item->board_sort)->toBe(2000)
        ->and($item->draft_data)->toBeNull();
});

test('kanban board_move patches draft_data group field when draft exists', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'is_singleton' => false,
        'versioning' => true,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'type' => FieldTypeEnum::Select,
        'settings' => [
            'options' => [
                ['value' => 'draft', 'label' => 'Draft'],
                ['value' => 'published', 'label' => 'Published'],
            ],
        ],
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
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
            'status' => 'published',
            'title' => 'Live',
        ]),
    );
    $item->draft_data = $normalizer->normalize($collection, [
        'status' => 'published',
        'title' => 'Draft title',
    ]);
    $item->save();

    $this->put(route('collections.items.update', [$collection, $item]), [
        'data' => ['status' => 'draft'],
        'board_move' => true,
        'save_action' => 'stay',
        'return' => route('collections.items.index', $collection, false),
    ])->assertRedirect();

    $item->refresh();
    $published = app(CollectionItemValuesAssembler::class)->assemble($item);
    expect($published['status'] ?? null)->toBe('draft')
        ->and($item->draft_data['status'] ?? null)->toBe('draft')
        ->and($item->draft_data['title'] ?? null)->toBe('Draft title');
});

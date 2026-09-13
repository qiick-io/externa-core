<?php

use App\Enums\CollectionPermissionAction;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItemRevision;
use App\Models\CollectionPermission;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\CollectionPermissionGuard;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use Database\Seeders\PermissionSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('item sync records a revision and restore rewrites data', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([]);
    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);

    $writer->sync($item, $collection, $normalizer->normalize($collection, ['title' => 'v1'], true));
    $writer->sync($item, $collection, $normalizer->normalize($collection, ['title' => 'v2'], false));

    expect(CollectionItemRevision::query()->where('item_id', $item->id)->count())->toBeGreaterThanOrEqual(2);

    $first = CollectionItemRevision::query()->where('item_id', $item->id)->orderBy('id')->firstOrFail();

    $this->get(route('collections.items.revisions.index', [$collection, $item]))
        ->assertOk();

    $this->getJson(route('collections.items.revisions.index', [$collection, $item]).'?json=1')
        ->assertOk()
        ->assertJsonStructure([
            'revisions',
            'meta' => ['current_page', 'last_page', 'per_page', 'total', 'has_more'],
            'filters' => ['date_from', 'date_to'],
        ])
        ->assertJsonPath('meta.per_page', 20);

    $this->post(route('collections.items.revisions.restore', [$collection, $item, $first]))
        ->assertRedirect();

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item->fresh());
    expect($assembled['title'])->toBe('v1');
});

test('item revisions index paginates and filters by date', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([]);

    $old = CollectionItemRevision::query()->create([
        'item_id' => $item->id,
        'user_id' => $user->id,
        'data' => ['title' => 'old'],
        'meta' => null,
        'created_at' => '2024-01-10 12:00:00',
    ]);
    $mid = CollectionItemRevision::query()->create([
        'item_id' => $item->id,
        'user_id' => $user->id,
        'data' => ['title' => 'mid'],
        'meta' => null,
        'created_at' => '2024-06-15 12:00:00',
    ]);
    $recent = CollectionItemRevision::query()->create([
        'item_id' => $item->id,
        'user_id' => $user->id,
        'data' => ['title' => 'recent'],
        'meta' => null,
        'created_at' => '2024-12-01 12:00:00',
    ]);

    $this->getJson(route('collections.items.revisions.index', [$collection, $item]).'?json=1&per_page=2')
        ->assertOk()
        ->assertJsonPath('meta.per_page', 2)
        ->assertJsonPath('meta.total', 3)
        ->assertJsonPath('meta.has_more', true)
        ->assertJsonCount(2, 'revisions');

    $this->getJson(route('collections.items.revisions.index', [$collection, $item]).'?json=1&per_page=2&page=2')
        ->assertOk()
        ->assertJsonPath('meta.current_page', 2)
        ->assertJsonPath('meta.has_more', false)
        ->assertJsonCount(1, 'revisions');

    $filtered = $this->getJson(
        route('collections.items.revisions.index', [$collection, $item])
            .'?json=1&date_from=2024-06-01&date_to=2024-06-30',
    )
        ->assertOk()
        ->assertJsonPath('meta.total', 1)
        ->assertJsonPath('filters.date_from', '2024-06-01')
        ->assertJsonPath('filters.date_to', '2024-06-30')
        ->json('revisions');

    expect($filtered[0]['id'])->toBe($mid->id);
    expect(collect($filtered)->pluck('id')->all())->not->toContain($old->id);
    expect(collect($filtered)->pluck('id')->all())->not->toContain($recent->id);

    // Single day = same from/to
    $this->getJson(
        route('collections.items.revisions.index', [$collection, $item])
            .'?json=1&date_from=2024-01-10&date_to=2024-01-10',
    )
        ->assertOk()
        ->assertJsonPath('meta.total', 1)
        ->assertJsonPath('revisions.0.id', $old->id);
});

test('content versioning saves draft and publish promotes', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['versioning' => true]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([]);
    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer->sync($item, $collection, $normalizer->normalize($collection, ['title' => 'live'], true));

    $this->put(route('collections.items.update', [$collection, $item]), [
        'version' => 'draft',
        'data' => ['title' => 'staging'],
    ])->assertRedirect();

    $item->refresh();
    expect($item->draft_data['title'] ?? null)->toBe('staging');
    expect(app(CollectionItemValuesAssembler::class)->assemble($item)['title'])->toBe('live');

    $this->post(route('collections.items.publish', [$collection, $item]))
        ->assertRedirect();

    $item->refresh();
    expect($item->draft_data)->toBeNull();
    expect(app(CollectionItemValuesAssembler::class)->assemble($item)['title'])->toBe('staging');
});

test('hard restore clears draft when versioning is enabled', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['versioning' => true]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([]);
    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer->sync($item, $collection, $normalizer->normalize($collection, ['title' => 'v1'], true));
    $writer->sync($item->fresh(), $collection, $normalizer->normalize($collection, ['title' => 'v2'], false));

    $item->draft_data = ['title' => 'stale-draft'];
    $item->save();

    $first = CollectionItemRevision::query()->where('item_id', $item->id)->orderBy('id')->firstOrFail();

    $this->post(route('collections.items.revisions.restore', [$collection, $item, $first]))
        ->assertRedirect();

    $item->refresh();
    expect($item->draft_data)->toBeNull();
    expect(app(CollectionItemValuesAssembler::class)->assemble($item)['title'])->toBe('v1');
});

test('show-only users can list revisions but cannot restore', function () {
    $user = grantCollectionPermissions(User::factory()->create(), [
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([]);
    $revision = CollectionItemRevision::query()->create([
        'item_id' => $item->id,
        'user_id' => $user->id,
        'data' => ['title' => 'old'],
        'meta' => null,
    ]);

    $this->get(route('collections.items.revisions.index', [$collection, $item]))
        ->assertOk();

    $this->post(route('collections.items.revisions.restore', [$collection, $item, $revision]))
        ->assertForbidden();
});

test('restore is blocked when field ACL denies update', function () {
    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'secret',
        'type' => FieldTypeEnum::String,
    ]);

    $role = Role::query()->create([
        'name' => 'revision-acl-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions(allCollectionPermissions());
    CollectionPermission::query()->create([
        'role_id' => $role->id,
        'collection_id' => $collection->id,
        'action' => CollectionPermissionAction::Update->value,
        'allowed' => true,
        'rules' => [
            'fields' => [
                'title' => ['read' => true, 'create' => true, 'update' => true],
                'secret' => ['read' => true, 'create' => false, 'update' => false],
            ],
        ],
    ]);
    CollectionPermission::query()->create([
        'role_id' => $role->id,
        'collection_id' => $collection->id,
        'action' => CollectionPermissionAction::Read->value,
        'allowed' => true,
        'rules' => null,
    ]);
    app(CollectionPermissionGuard::class)->forget($role->id);

    $user = User::factory()->create();
    $user->syncRoles([$role]);
    $this->actingAs($user);

    $item = $collection->items()->create([]);
    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer->sync($item, $collection, $normalizer->normalize($collection, [
        'title' => 'now',
        'secret' => 'live',
    ], true));

    $revision = CollectionItemRevision::query()->create([
        'item_id' => $item->id,
        'user_id' => $user->id,
        'data' => ['title' => 'old', 'secret' => 'leaked'],
        'meta' => null,
    ]);

    $this->post(route('collections.items.revisions.restore', [$collection, $item, $revision]))
        ->assertSessionHasErrors('data');

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item->fresh());
    expect($assembled['title'])->toBe('now')
        ->and($assembled['secret'])->toBe('live');
});

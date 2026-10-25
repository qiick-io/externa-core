<?php

use App\Enums\CollectionPermissionAction;
use App\Enums\FieldTypeEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionPermission;
use App\Models\Role;
use App\Services\Api\CollectionPermissionGuard;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

function rulesPublicRole(): Role
{
    return Role::query()->where('name', RoleEnum::Public->value)->firstOrFail();
}

function grantWithRules(Collection $collection, array $actions, array $rules): void
{
    $role = rulesPublicRole();
    foreach ($actions as $action) {
        $value = $action instanceof CollectionPermissionAction ? $action->value : $action;
        CollectionPermission::query()->updateOrCreate(
            [
                'role_id' => $role->id,
                'collection_id' => $collection->id,
                'action' => $value,
            ],
            [
                'allowed' => true,
                'rules' => $rules,
            ],
        );
    }

    app(CollectionPermissionGuard::class)->forget($role->id);
}

test('field rules strip unreadables and item_filter hides non-matching items', function () {
    $collection = Collection::query()->create([
        'name' => 'Articles',
        'slug' => 'articles',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
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

    $rules = [
        'fields' => [
            'title' => ['read' => true, 'create' => true, 'update' => true],
            'status' => ['read' => false, 'create' => false, 'update' => false],
        ],
        'item_filter' => [
            'logic' => 'and',
            'rules' => [
                ['field' => 'status', 'operator' => 'equals', 'value' => 'published'],
            ],
        ],
    ];

    grantWithRules($collection, [
        CollectionPermissionAction::Read,
        CollectionPermissionAction::Update,
        CollectionPermissionAction::Create,
    ], $rules);

    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer = app(CollectionItemValuesWriter::class);

    $published = $collection->items()->create([]);
    $writer->sync($published, $collection, $normalizer->normalize($collection, [
        'title' => 'Public post',
        'status' => 'published',
    ], true));

    $draft = $collection->items()->create([]);
    $writer->sync($draft, $collection, $normalizer->normalize($collection, [
        'title' => 'Secret draft',
        'status' => 'draft',
    ], true));

    $list = $this->getJson('/api/v1/collections/articles/items');
    $list->assertOk();
    $ids = collect($list->json('data'))->pluck('id')->all();
    expect($ids)->toContain($published->id)->not->toContain($draft->id);

    $showPublished = $this->getJson('/api/v1/collections/articles/items/'.$published->id);
    $showPublished->assertOk();
    expect($showPublished->json('data.data'))->toHaveKey('title')
        ->and($showPublished->json('data.data'))->not->toHaveKey('status');

    $this->getJson('/api/v1/collections/articles/items/'.$draft->id)->assertNotFound();

    $this->patchJson('/api/v1/collections/articles/items/'.$published->id, [
        'data' => ['status' => 'archived'],
    ])->assertUnprocessable();

    $this->patchJson('/api/v1/collections/articles/items/'.$draft->id, [
        'data' => ['title' => 'Nope'],
    ])->assertForbidden();
});

test('empty field map leaves all fields readable', function () {
    $collection = Collection::query()->create([
        'name' => 'Notes',
        'slug' => 'notes',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'body',
        'type' => FieldTypeEnum::String,
    ]);

    grantWithRules($collection, [CollectionPermissionAction::Read], [
        'fields' => [],
        'item_filter' => null,
    ]);

    $item = $collection->items()->create([]);
    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection,
        app(CollectionItemDataNormalizer::class)->normalize($collection, ['body' => 'Hello'], true),
    );

    $this->getJson('/api/v1/collections/notes/items/'.$item->id)
        ->assertOk()
        ->assertJsonPath('data.data.body', 'Hello');
});

test('item_filter SQL pushdown returns coherent totals and pages', function () {
    $collection = Collection::query()->create([
        'name' => 'Posts',
        'slug' => 'posts-filter-totals',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
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

    grantWithRules($collection, [CollectionPermissionAction::Read], [
        'fields' => [],
        'item_filter' => [
            'logic' => 'and',
            'rules' => [
                ['field' => 'status', 'operator' => 'equals', 'value' => 'published'],
            ],
        ],
    ]);

    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer = app(CollectionItemValuesWriter::class);

    $publishedIds = [];
    for ($i = 0; $i < 5; $i++) {
        $item = $collection->items()->create([]);
        $writer->sync($item, $collection, $normalizer->normalize($collection, [
            'title' => "Published {$i}",
            'status' => 'published',
        ], true));
        $publishedIds[] = $item->id;
    }

    for ($i = 0; $i < 12; $i++) {
        $item = $collection->items()->create([]);
        $writer->sync($item, $collection, $normalizer->normalize($collection, [
            'title' => "Draft {$i}",
            'status' => 'draft',
        ], true));
    }

    $page1 = $this->getJson('/api/v1/collections/posts-filter-totals/items?per_page=2&page=1');
    $page1->assertOk();
    expect($page1->json('meta.total'))->toBe(5)
        ->and($page1->json('meta.last_page'))->toBe(3)
        ->and($page1->json('meta.per_page'))->toBe(2)
        ->and($page1->json('meta.current_page'))->toBe(1)
        ->and($page1->json('data'))->toHaveCount(2);

    $page3 = $this->getJson('/api/v1/collections/posts-filter-totals/items?per_page=2&page=3');
    $page3->assertOk();
    expect($page3->json('meta.total'))->toBe(5)
        ->and($page3->json('meta.current_page'))->toBe(3)
        ->and($page3->json('data'))->toHaveCount(1);

    $listed = collect($page1->json('data'))
        ->merge($this->getJson('/api/v1/collections/posts-filter-totals/items?per_page=2&page=2')->json('data'))
        ->merge($page3->json('data'))
        ->pluck('id')
        ->all();

    expect($listed)->toHaveCount(5)
        ->and(collect($listed)->diff($publishedIds)->all())->toBe([]);

    $hiddenDraft = $collection->items()->latest('id')->firstOrFail();
    $this->getJson('/api/v1/collections/posts-filter-totals/items/'.$hiddenDraft->id)
        ->assertNotFound();
});

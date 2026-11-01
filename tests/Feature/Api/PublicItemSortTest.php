<?php

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionPermission;
use App\Models\Role;
use App\Services\Api\CollectionPermissionGuardService;
use App\Services\Api\PublicApiResponseCacheService;
use App\Services\Collections\CollectionItemDataNormalizerService;
use App\Services\Collections\CollectionItemValuesWriterService;
use App\Services\Settings\ProjectSettingsService;
use App\Services\Settings\SettingsRepositoryService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

/**
 * @return array{collection: Collection, slug: string, title: CollectionField, score: CollectionField, body: CollectionField}
 */
function sortCollection(string $prefix = 'sort'): array
{
    $slug = $prefix.'-'.uniqid();
    $collection = Collection::query()->create([
        'name' => 'Sort '.$slug,
        'slug' => $slug,
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    $title = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);
    $score = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'score',
        'type' => FieldTypeEnum::Number,
        'translatable' => false,
    ]);
    $body = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'body',
        'type' => FieldTypeEnum::Wysiwyg,
        'translatable' => false,
    ]);
    $label = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'label',
        'type' => FieldTypeEnum::String,
        'translatable' => true,
    ]);

    grantPublicActions($collection, [CollectionPermissionActionEnum::Read]);

    return [
        'collection' => $collection,
        'slug' => $slug,
        'title' => $title,
        'score' => $score,
        'body' => $body,
        'label' => $label,
    ];
}

function syncSortItem(CollectionItem $item, Collection $collection, array $data): void
{
    $normalized = app(CollectionItemDataNormalizerService::class)->normalize($collection, $data, true);
    app(CollectionItemValuesWriterService::class)->sync($item, $collection, $normalized);
}

/**
 * @param  array{title?: string, score?: int|float|string|null, published_at?: string|null, label?: array<string, string>|null}  $attrs
 */
function makeSortItem(Collection $collection, array $attrs = []): CollectionItem
{
    $item = $collection->items()->create([
        'published_at' => $attrs['published_at'] ?? null,
    ]);

    $data = [];
    if (array_key_exists('title', $attrs)) {
        $data['title'] = $attrs['title'];
    }
    if (array_key_exists('score', $attrs)) {
        $data['score'] = $attrs['score'];
    }
    if (array_key_exists('label', $attrs) && is_array($attrs['label'])) {
        $data['label'] = $attrs['label'];
    }

    if ($data !== []) {
        syncSortItem($item, $collection, $data);
    }

    return $item->fresh();
}

it('defaults to newest id first when sort is omitted', function (): void {
    ['collection' => $collection, 'slug' => $slug] = sortCollection('default');

    $first = makeSortItem($collection, ['title' => 'A']);
    $second = makeSortItem($collection, ['title' => 'B']);
    $third = makeSortItem($collection, ['title' => 'C']);

    $ids = collect($this->getJson("/api/v1/collections/{$slug}/items")->assertOk()->json('data'))
        ->pluck('id')
        ->all();

    expect($ids)->toBe([$third->id, $second->id, $first->id]);
});

it('orders by published_at desc then title asc with id tiebreaker across pages', function (): void {
    ['collection' => $collection, 'slug' => $slug] = sortCollection('pub');

    $oldA = makeSortItem($collection, ['title' => 'A', 'published_at' => '2024-01-01 10:00:00']);
    $oldB = makeSortItem($collection, ['title' => 'B', 'published_at' => '2024-01-01 10:00:00']);
    $mid = makeSortItem($collection, ['title' => 'M', 'published_at' => '2024-06-01 10:00:00']);
    $new = makeSortItem($collection, ['title' => 'N', 'published_at' => '2025-01-01 10:00:00']);
    $nullTitle = makeSortItem($collection, ['title' => 'Z', 'published_at' => null]);

    $page1 = $this->getJson("/api/v1/collections/{$slug}/items?sort=-published_at,title&per_page=2&page=1")
        ->assertOk();
    $page2 = $this->getJson("/api/v1/collections/{$slug}/items?sort=-published_at,title&per_page=2&page=2")
        ->assertOk();
    $page3 = $this->getJson("/api/v1/collections/{$slug}/items?sort=-published_at,title&per_page=2&page=3")
        ->assertOk();

    $ordered = collect($page1->json('data'))
        ->merge($page2->json('data'))
        ->merge($page3->json('data'))
        ->pluck('id')
        ->all();

    expect($ordered)->toBe([$new->id, $mid->id, $oldA->id, $oldB->id, $nullTitle->id])
        ->and($page1->json('data.0'))->toHaveKey('published_at')
        ->and($page1->json('meta.total'))->toBe(5);
});

it('sorts numeric fields numerically not lexicographically', function (): void {
    ['collection' => $collection, 'slug' => $slug] = sortCollection('num');

    $ten = makeSortItem($collection, ['title' => 'ten', 'score' => 10]);
    $two = makeSortItem($collection, ['title' => 'two', 'score' => 2]);
    $nine = makeSortItem($collection, ['title' => 'nine', 'score' => 9]);

    $ids = collect($this->getJson("/api/v1/collections/{$slug}/items?sort=score")->assertOk()->json('data'))
        ->pluck('id')
        ->all();

    expect($ids)->toBe([$two->id, $nine->id, $ten->id]);
});

it('sorts translatable fields by request locale with missing translations last', function (): void {
    app(SettingsRepositoryService::class)->setMany(
        SettingsRepositoryService::SCOPE_PROJECT,
        'project',
        [
            'content_locales' => ['en', 'it'],
            'default_content_locale' => 'en',
            'fallback_content_locales' => ['en'],
        ],
    );
    app(ProjectSettingsService::class)->forgetRawCache();

    ['collection' => $collection, 'slug' => $slug] = sortCollection('i18n');

    $enOnly = makeSortItem($collection, ['title' => 'en', 'label' => ['en' => 'Zebra']]);
    $both = makeSortItem($collection, ['title' => 'both', 'label' => ['en' => 'Alpha', 'it' => 'Beta']]);
    $itOnly = makeSortItem($collection, ['title' => 'it', 'label' => ['it' => 'Alpha']]);

    $enOrder = collect($this->getJson("/api/v1/collections/{$slug}/items?sort=label&locale=en")->assertOk()->json('data'))
        ->pluck('id')
        ->all();
    expect($enOrder)->toBe([$both->id, $enOnly->id, $itOnly->id]);

    $itOrder = collect($this->getJson("/api/v1/collections/{$slug}/items?sort=label&locale=it")->assertOk()->json('data'))
        ->pluck('id')
        ->all();
    expect($itOrder)->toBe([$itOnly->id, $both->id, $enOnly->id]);
});

it('rejects unknown non-sortable unreadable too-many and malformed sort tokens with 422', function (): void {
    ['collection' => $collection, 'slug' => $slug] = sortCollection('val');
    makeSortItem($collection, ['title' => 'x']);

    $this->getJson("/api/v1/collections/{$slug}/items?sort=nope")
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['sort']);

    $this->getJson("/api/v1/collections/{$slug}/items?sort=body")
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['sort']);

    $this->getJson("/api/v1/collections/{$slug}/items?sort=id,created_at,updated_at,published_at")
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['sort']);

    $this->getJson("/api/v1/collections/{$slug}/items?sort=-")
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['sort']);

    $this->getJson("/api/v1/collections/{$slug}/items?sort=1bad")
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['sort']);

    $role = Role::query()->where('name', RoleEnum::Public->value)->firstOrFail();
    CollectionPermission::query()->where('role_id', $role->id)->where('collection_id', $collection->id)->delete();
    CollectionPermission::query()->create([
        'role_id' => $role->id,
        'collection_id' => $collection->id,
        'action' => CollectionPermissionActionEnum::Read->value,
        'allowed' => true,
        'rules' => [
            'fields' => [
                'title' => ['read' => true, 'create' => false, 'update' => false],
                'score' => ['read' => false, 'create' => false, 'update' => false],
                'body' => ['read' => false, 'create' => false, 'update' => false],
                'label' => ['read' => false, 'create' => false, 'update' => false],
            ],
            'item_filter' => null,
        ],
    ]);
    app(CollectionPermissionGuardService::class)->forget($role->id);

    $this->getJson("/api/v1/collections/{$slug}/items?sort=score")
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['sort']);
});

it('keeps distinct response-cache payloads per sort', function (): void {
    ['collection' => $collection, 'slug' => $slug] = sortCollection('cache');

    makeSortItem($collection, ['title' => 'A', 'published_at' => '2024-01-01 00:00:00']);
    makeSortItem($collection, ['title' => 'B', 'published_at' => '2025-01-01 00:00:00']);

    $cache = app(PublicApiResponseCacheService::class);
    $version = $cache->version((int) $collection->id);
    $hashAsc = $cache->hash(['sort' => 'published_at', 'page' => 1, 'per_page' => 15, 'surface' => 'probe']);
    $hashDesc = $cache->hash(['sort' => '-published_at', 'page' => 1, 'per_page' => 15, 'surface' => 'probe']);
    expect($hashAsc)->not->toBe($hashDesc);

    $asc = $this->getJson("/api/v1/collections/{$slug}/items?sort=published_at")->assertOk()->json('data.0.id');
    $desc = $this->getJson("/api/v1/collections/{$slug}/items?sort=-published_at")->assertOk()->json('data.0.id');
    expect($asc)->not->toBe($desc);

    // Warm both; re-hit must keep distinct first ids (cache key includes sort).
    expect($this->getJson("/api/v1/collections/{$slug}/items?sort=published_at")->assertOk()->json('data.0.id'))->toBe($asc)
        ->and($this->getJson("/api/v1/collections/{$slug}/items?sort=-published_at")->assertOk()->json('data.0.id'))->toBe($desc)
        ->and($cache->itemsKey($slug, $version, $hashAsc))->not->toBe($cache->itemsKey($slug, $version, $hashDesc));
});

it('supports GraphQL items(sort) the same as REST', function (): void {
    ['collection' => $collection, 'slug' => $slug] = sortCollection('gql');

    $old = makeSortItem($collection, ['title' => 'A', 'published_at' => '2024-01-01 00:00:00']);
    $new = makeSortItem($collection, ['title' => 'B', 'published_at' => '2025-01-01 00:00:00']);

    $response = $this->postJson('/api/graphql', [
        'query' => <<<'GQL'
            query ($c: String!, $sort: [String!]) {
                items(collection: $c, sort: $sort) {
                    data { id published_at }
                    meta { total }
                }
            }
            GQL,
        'variables' => [
            'c' => $slug,
            'sort' => ['-published_at'],
        ],
    ])->assertOk();

    expect($response->json('errors'))->toBeNull()
        ->and($response->json('data.items.meta.total'))->toBe(2)
        ->and((int) $response->json('data.items.data.0.id'))->toBe($new->id)
        ->and((int) $response->json('data.items.data.1.id'))->toBe($old->id)
        ->and($response->json('data.items.data.0'))->toHaveKey('published_at');

    $bad = $this->postJson('/api/graphql', [
        'query' => <<<'GQL'
            query ($c: String!, $sort: [String!]) {
                items(collection: $c, sort: $sort) { data { id } }
            }
            GQL,
        'variables' => [
            'c' => $slug,
            'sort' => ['a', 'b', 'c', 'd'],
        ],
    ]);

    expect(in_array($bad->status(), [200, 422], true))->toBeTrue();
    if ($bad->status() === 200) {
        expect($bad->json('errors'))->not->toBeEmpty();
    }
});

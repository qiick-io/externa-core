<?php

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionPermission;
use App\Services\Api\CollectionPermissionGuardService;
use App\Services\Api\PublicApiResponseCacheService;
use App\Services\Collections\CollectionItemDataNormalizerService;
use App\Services\Collections\CollectionItemValuesWriterService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\RateLimiter;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    RateLimiter::clear('api-cost:127.0.0.1');
    RateLimiter::clear('api-cost:::1');
});

/**
 * @return array{collection: Collection, slug: string, title: CollectionField}
 */
function systemFilterCollection(string $prefix = 'sysf'): array
{
    $slug = $prefix.'-'.uniqid();
    $collection = Collection::query()->create([
        'name' => 'System filter '.$slug,
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

    grantPublicActions($collection, [CollectionPermissionActionEnum::Read]);

    return [
        'collection' => $collection,
        'slug' => $slug,
        'title' => $title,
    ];
}

/**
 * @param  array{title?: string, published_at?: string|null, created_at?: string|null, updated_at?: string|null}  $attrs
 */
function makeSystemFilterItem(Collection $collection, array $attrs = []): CollectionItem
{
    $item = $collection->items()->create([
        'published_at' => $attrs['published_at'] ?? null,
    ]);

    if (array_key_exists('title', $attrs)) {
        $normalized = app(CollectionItemDataNormalizerService::class)->normalize(
            $collection,
            ['title' => $attrs['title']],
            true,
        );
        app(CollectionItemValuesWriterService::class)->sync($item, $collection, $normalized);
    }

    $timestamps = [];
    if (array_key_exists('created_at', $attrs) && $attrs['created_at'] !== null) {
        $timestamps['created_at'] = $attrs['created_at'];
    }
    if (array_key_exists('updated_at', $attrs) && $attrs['updated_at'] !== null) {
        $timestamps['updated_at'] = $attrs['updated_at'];
    }
    if ($timestamps !== []) {
        CollectionItem::query()->whereKey($item->id)->update($timestamps);
    }

    return $item->fresh();
}

it('filters REST items by published_at range and id _in', function (): void {
    ['collection' => $collection, 'slug' => $slug] = systemFilterCollection('rest');

    $old = makeSystemFilterItem($collection, [
        'title' => 'Old',
        'published_at' => '2025-06-01 12:00:00',
    ]);
    $mid = makeSystemFilterItem($collection, [
        'title' => 'Mid',
        'published_at' => '2026-03-15 08:00:00',
    ]);
    $new = makeSystemFilterItem($collection, [
        'title' => 'New',
        'published_at' => '2026-08-01 00:00:00',
    ]);
    makeSystemFilterItem($collection, [
        'title' => 'Draft',
        'published_at' => null,
    ]);

    $range = $this->getJson(
        '/api/v1/collections/'.$slug.'/items?'.http_build_query([
            'filter' => [
                'published_at' => [
                    '_gte' => '2026-01-01',
                    '_lt' => '2026-07-01',
                ],
            ],
            'sort' => 'id',
            'per_page' => 50,
        ])
    )->assertOk();

    expect(collect($range->json('data'))->pluck('id')->all())->toBe([$mid->id])
        ->and($range->json('meta.total'))->toBe(1);

    $byIds = $this->getJson(
        '/api/v1/collections/'.$slug.'/items?'.http_build_query([
            'filter' => [
                'id' => ['_in' => $old->id.','.$new->id],
            ],
            'sort' => 'id',
            'per_page' => 50,
        ])
    )->assertOk();

    expect(collect($byIds->json('data'))->pluck('id')->sort()->values()->all())
        ->toBe(collect([$old->id, $new->id])->sort()->values()->all());
});

it('filters REST items by created_at updated_at and id comparisons', function (): void {
    ['collection' => $collection, 'slug' => $slug] = systemFilterCollection('ts');

    $early = makeSystemFilterItem($collection, [
        'title' => 'Early',
        'created_at' => '2024-01-01 10:00:00',
        'updated_at' => '2024-02-01 10:00:00',
    ]);
    $late = makeSystemFilterItem($collection, [
        'title' => 'Late',
        'created_at' => '2025-06-01 10:00:00',
        'updated_at' => '2025-07-01 10:00:00',
    ]);

    $created = $this->getJson(
        '/api/v1/collections/'.$slug.'/items?'.http_build_query([
            'filter' => ['created_at' => ['_gte' => '2025-01-01']],
            'sort' => 'id',
        ])
    )->assertOk();
    expect(collect($created->json('data'))->pluck('id')->all())->toBe([$late->id]);

    $updated = $this->getJson(
        '/api/v1/collections/'.$slug.'/items?'.http_build_query([
            'filter' => ['updated_at' => ['_lt' => '2025-01-01']],
            'sort' => 'id',
        ])
    )->assertOk();
    expect(collect($updated->json('data'))->pluck('id')->all())->toBe([$early->id]);

    $idEq = $this->getJson(
        '/api/v1/collections/'.$slug.'/items?'.http_build_query([
            'filter' => ['id' => ['_eq' => $early->id]],
        ])
    )->assertOk();
    expect(collect($idEq->json('data'))->pluck('id')->all())->toBe([$early->id]);

    $idGt = $this->getJson(
        '/api/v1/collections/'.$slug.'/items?'.http_build_query([
            'filter' => ['id' => ['_gt' => $early->id]],
            'sort' => 'id',
        ])
    )->assertOk();
    expect(collect($idGt->json('data'))->pluck('id')->all())->toBe([$late->id]);
});

it('filters null published_at with _null and _nnull', function (): void {
    ['collection' => $collection, 'slug' => $slug] = systemFilterCollection('null');

    $published = makeSystemFilterItem($collection, [
        'title' => 'Live',
        'published_at' => '2026-01-15 00:00:00',
    ]);
    $draft = makeSystemFilterItem($collection, [
        'title' => 'Draft',
        'published_at' => null,
    ]);

    $nulls = $this->getJson(
        '/api/v1/collections/'.$slug.'/items?'.http_build_query([
            'filter' => ['published_at' => ['_null' => '1']],
        ])
    )->assertOk();
    expect(collect($nulls->json('data'))->pluck('id')->all())->toBe([$draft->id]);

    $present = $this->getJson(
        '/api/v1/collections/'.$slug.'/items?'.http_build_query([
            'filter' => ['published_at' => ['_nnull' => '1']],
        ])
    )->assertOk();
    expect(collect($present->json('data'))->pluck('id')->all())->toBe([$published->id]);
});

it('combines system filters with field filters and sort', function (): void {
    ['collection' => $collection, 'slug' => $slug] = systemFilterCollection('combo');

    makeSystemFilterItem($collection, [
        'title' => 'Alpha',
        'published_at' => '2026-02-01 00:00:00',
    ]);
    $keep = makeSystemFilterItem($collection, [
        'title' => 'Beta',
        'published_at' => '2026-03-01 00:00:00',
    ]);
    makeSystemFilterItem($collection, [
        'title' => 'Beta',
        'published_at' => '2025-01-01 00:00:00',
    ]);

    $response = $this->getJson(
        '/api/v1/collections/'.$slug.'/items?'.http_build_query([
            'filter' => [
                'title' => ['_eq' => 'Beta'],
                'published_at' => ['_gte' => '2026-01-01'],
            ],
            'sort' => '-published_at',
        ])
    )->assertOk();

    expect($response->json('meta.total'))->toBe(1)
        ->and($response->json('data.0.id'))->toBe($keep->id);
});

it('rejects unsupported operators and invalid datetime values with 422', function (): void {
    ['slug' => $slug] = systemFilterCollection('bad');

    $this->getJson(
        '/api/v1/collections/'.$slug.'/items?'.http_build_query([
            'filter' => ['published_at' => ['_contains' => '2026']],
        ])
    )->assertUnprocessable()
        ->assertJsonValidationErrors(['filter.published_at']);

    $this->getJson(
        '/api/v1/collections/'.$slug.'/items?'.http_build_query([
            'filter' => ['id' => ['_null' => '1']],
        ])
    )->assertUnprocessable()
        ->assertJsonValidationErrors(['filter.id']);

    $this->getJson(
        '/api/v1/collections/'.$slug.'/items?'.http_build_query([
            'filter' => ['created_at' => ['_gte' => 'not-a-date']],
        ])
    )->assertUnprocessable()
        ->assertJsonValidationErrors(['filter.created_at._gte']);

    $this->getJson(
        '/api/v1/collections/'.$slug.'/items?'.http_build_query([
            'filter' => ['id' => ['_eq' => 'abc']],
        ])
    )->assertUnprocessable()
        ->assertJsonValidationErrors(['filter.id._eq']);
});

it('applies role item_filter on top of system field filters', function (): void {
    ['collection' => $collection, 'slug' => $slug] = systemFilterCollection('role');

    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);

    $role = publicRole();
    CollectionPermission::query()
        ->where('role_id', $role->id)
        ->where('collection_id', $collection->id)
        ->delete();
    CollectionPermission::query()->create([
        'role_id' => $role->id,
        'collection_id' => $collection->id,
        'action' => CollectionPermissionActionEnum::Read->value,
        'allowed' => true,
        'rules' => [
            'fields' => [],
            'item_filter' => [
                'logic' => 'and',
                'rules' => [
                    ['field' => 'status', 'operator' => 'equals', 'value' => 'published'],
                ],
            ],
        ],
    ]);
    app(CollectionPermissionGuardService::class)->forget($role->id);

    $fresh = $collection->fresh(['fields']);
    $live = makeSystemFilterItem($fresh, [
        'title' => 'Live',
        'published_at' => '2026-04-01 00:00:00',
    ]);
    app(CollectionItemValuesWriterService::class)->sync(
        $live,
        $fresh,
        app(CollectionItemDataNormalizerService::class)->normalize($fresh, [
            'title' => 'Live',
            'status' => 'published',
        ], true),
    );

    $draft = makeSystemFilterItem($fresh, [
        'title' => 'Hidden',
        'published_at' => '2026-05-01 00:00:00',
    ]);
    app(CollectionItemValuesWriterService::class)->sync(
        $draft,
        $fresh,
        app(CollectionItemDataNormalizerService::class)->normalize($fresh, [
            'title' => 'Hidden',
            'status' => 'draft',
        ], true),
    );

    $response = $this->getJson(
        '/api/v1/collections/'.$slug.'/items?'.http_build_query([
            'filter' => ['published_at' => ['_gte' => '2026-01-01']],
            'sort' => 'id',
            'per_page' => 50,
        ])
    )->assertOk();

    expect(collect($response->json('data'))->pluck('id')->all())->toBe([$live->id])
        ->and($response->json('meta.total'))->toBe(1);
});

it('keeps distinct response-cache keys per system filter', function (): void {
    ['collection' => $collection, 'slug' => $slug] = systemFilterCollection('cache');

    makeSystemFilterItem($collection, [
        'title' => 'A',
        'published_at' => '2024-01-01 00:00:00',
    ]);
    makeSystemFilterItem($collection, [
        'title' => 'B',
        'published_at' => '2026-01-01 00:00:00',
    ]);

    $cache = app(PublicApiResponseCacheService::class);
    $hashA = $cache->hash([
        'filter' => ['published_at' => ['_gte' => '2025-01-01']],
        'page' => 1,
        'per_page' => 15,
        'surface' => 'probe',
    ]);
    $hashB = $cache->hash([
        'filter' => ['published_at' => ['_gte' => '2020-01-01']],
        'page' => 1,
        'per_page' => 15,
        'surface' => 'probe',
    ]);
    expect($hashA)->not->toBe($hashB);

    $narrow = $this->getJson(
        '/api/v1/collections/'.$slug.'/items?'.http_build_query([
            'filter' => ['published_at' => ['_gte' => '2025-01-01']],
        ])
    )->assertOk();
    $wide = $this->getJson(
        '/api/v1/collections/'.$slug.'/items?'.http_build_query([
            'filter' => ['published_at' => ['_gte' => '2020-01-01']],
        ])
    )->assertOk();

    expect($narrow->json('meta.total'))->toBe(1)
        ->and($wide->json('meta.total'))->toBe(2)
        ->and($this->getJson(
            '/api/v1/collections/'.$slug.'/items?'.http_build_query([
                'filter' => ['published_at' => ['_gte' => '2025-01-01']],
            ])
        )->assertOk()->json('meta.total'))->toBe(1);
});

it('filters GraphQL items by system keys the same as REST', function (): void {
    ['collection' => $collection, 'slug' => $slug] = systemFilterCollection('gql');

    $keep = makeSystemFilterItem($collection, [
        'title' => 'Keep',
        'published_at' => '2026-02-01 00:00:00',
    ]);
    makeSystemFilterItem($collection, [
        'title' => 'Drop',
        'published_at' => '2024-01-01 00:00:00',
    ]);

    $response = $this->postJson('/api/graphql', [
        'query' => <<<'GQL'
            query ($c: String!, $filter: JSON) {
                items(collection: $c, filter: $filter) {
                    data { id }
                    meta { total }
                }
            }
            GQL,
        'variables' => [
            'c' => $slug,
            'filter' => [
                'published_at' => ['_gte' => '2026-01-01'],
                'id' => ['_eq' => $keep->id],
            ],
        ],
    ])->assertOk();

    expect($response->json('errors'))->toBeNull()
        ->and($response->json('data.items.meta.total'))->toBe(1)
        ->and((int) $response->json('data.items.data.0.id'))->toBe($keep->id);

    $bad = $this->postJson('/api/graphql', [
        'query' => <<<'GQL'
            query ($c: String!, $filter: JSON) {
                items(collection: $c, filter: $filter) {
                    data { id }
                }
            }
            GQL,
        'variables' => [
            'c' => $slug,
            'filter' => ['published_at' => ['_contains' => 'x']],
        ],
    ]);

    expect(in_array($bad->status(), [200, 422], true))->toBeTrue();
    if ($bad->status() === 200) {
        expect($bad->json('errors'))->not->toBeEmpty();
    } else {
        $bad->assertUnprocessable();
    }
});

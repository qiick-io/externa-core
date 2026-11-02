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
use App\Support\Validation\FilterQueryLimits;
use App\Support\Validation\StringLimits;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    RateLimiter::clear('api-cost:127.0.0.1');
    RateLimiter::clear('api-cost:::1');
});

/**
 * @return array{
 *     posts: Collection,
 *     authors: Collection,
 *     slug: string,
 *     adaPost: CollectionItem,
 *     gracePost: CollectionItem,
 *     orphanPost: CollectionItem,
 *     ada: CollectionItem,
 *     grace: CollectionItem
 * }
 */
function makeDeepFilterGraph(string $prefix = 'df'): array
{
    $suffix = $prefix.'-'.uniqid();

    $authors = Collection::query()->create([
        'name' => 'Authors '.$suffix,
        'slug' => $suffix.'-authors',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $authors->id,
        'name' => 'name',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);

    $ada = $authors->items()->create([]);
    syncDeepFilterItem($ada, $authors->fresh(['fields']), ['name' => 'Ada']);
    $grace = $authors->items()->create([]);
    syncDeepFilterItem($grace, $authors->fresh(['fields']), ['name' => 'Grace']);

    $posts = Collection::query()->create([
        'name' => 'Posts '.$suffix,
        'slug' => $suffix.'-posts',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $posts->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $posts->id,
        'name' => 'author',
        'type' => FieldTypeEnum::ManyToOne,
        'settings' => ['related_collection_id' => $authors->id],
    ]);

    $adaPost = $posts->items()->create([]);
    syncDeepFilterItem($adaPost, $posts->fresh(['fields']), [
        'title' => 'Notes on Ada',
        'author' => $ada->id,
    ]);
    $gracePost = $posts->items()->create([]);
    syncDeepFilterItem($gracePost, $posts->fresh(['fields']), [
        'title' => 'Notes on Grace',
        'author' => $grace->id,
    ]);
    $orphanPost = $posts->items()->create([]);
    syncDeepFilterItem($orphanPost, $posts->fresh(['fields']), [
        'title' => 'No author',
    ]);

    grantPublicActions($posts, [CollectionPermissionActionEnum::Read]);
    grantPublicActions($authors, [CollectionPermissionActionEnum::Read]);

    return [
        'posts' => $posts,
        'authors' => $authors,
        'slug' => $posts->slug,
        'adaPost' => $adaPost->fresh(),
        'gracePost' => $gracePost->fresh(),
        'orphanPost' => $orphanPost->fresh(),
        'ada' => $ada->fresh(),
        'grace' => $grace->fresh(),
    ];
}

/**
 * @param  array<string, mixed>  $data
 */
function syncDeepFilterItem(CollectionItem $item, Collection $collection, array $data): void
{
    $normalized = app(CollectionItemDataNormalizerService::class)->normalize($collection, $data, true);
    app(CollectionItemValuesWriterService::class)->sync($item, $collection, $normalized);
}

it('filters REST items by a related field at depth 1', function (): void {
    $graph = makeDeepFilterGraph('rest');

    $response = $this->getJson(
        '/api/v1/collections/'.$graph['slug'].'/items?'.http_build_query([
            'filter' => ['author.name' => ['_eq' => 'Ada']],
        ])
    )->assertOk();

    $ids = collect($response->json('data'))->pluck('id')->all();

    expect($ids)->toBe([$graph['adaPost']->id])
        ->and($response->json('meta.total'))->toBe(1);
});

it('filters GraphQL items by a related field at depth 1', function (): void {
    $graph = makeDeepFilterGraph('gql');

    $response = $this->postJson('/api/graphql', [
        'query' => 'query DeepFilter($collection: String!, $filter: JSON) {
            items(collection: $collection, filter: $filter) {
                data { id }
                meta { total }
            }
        }',
        'variables' => [
            'collection' => $graph['slug'],
            'filter' => ['author.name' => ['_eq' => 'Grace']],
        ],
    ])->assertOk();

    expect($response->json('errors'))->toBeNull()
        ->and($response->json('data.items.meta.total'))->toBe(1)
        ->and($response->json('data.items.data.0.id'))->toBe((string) $graph['gracePost']->id);
});

it('rejects relational filter depth above the hard cap with 422', function (): void {
    $graph = makeDeepFilterGraph('depth');

    $this->getJson(
        '/api/v1/collections/'.$graph['slug'].'/items?'.http_build_query([
            'filter' => ['author.profile.city' => ['_eq' => 'x']],
        ])
    )->assertUnprocessable()
        ->assertJsonValidationErrors(['filter']);

    expect(fn () => FilterQueryLimits::assertValid([
        'a.b.c' => ['_eq' => 'x'],
    ]))->toThrow(ValidationException::class);

    expect(StringLimits::FILTER_MAX_RELATION_DEPTH)->toBe(1);
});

it('does not leak related values when the related collection is not readable', function (): void {
    $graph = makeDeepFilterGraph('leak');

    // Revoke public Read on authors only.
    $role = publicRole();
    CollectionPermission::query()
        ->where('role_id', $role->id)
        ->where('collection_id', $graph['authors']->id)
        ->delete();
    app(CollectionPermissionGuardService::class)->forget($role->id);

    $response = $this->getJson(
        '/api/v1/collections/'.$graph['slug'].'/items?'.http_build_query([
            'filter' => ['author.name' => ['_eq' => 'Ada']],
            'per_page' => 50,
        ])
    )->assertOk();

    expect($response->json('meta.total'))->toBe(0)
        ->and($response->json('data'))->toBe([])
        ->and(json_encode($response->json()))->not->toContain('Ada')
        ->and(json_encode($response->json()))->not->toContain('Grace');
});

it('keeps relational filter list query count bounded', function (): void {
    $graph = makeDeepFilterGraph('qcount');

    $url = '/api/v1/collections/'.$graph['slug'].'/items?'.http_build_query([
        'filter' => ['author.name' => ['_eq' => 'Ada']],
        'per_page' => 15,
    ]);

    // Warm caches outside the measured window.
    $this->getJson($url)->assertOk();
    app(PublicApiResponseCacheService::class)->bump((int) $graph['posts']->id);

    DB::flushQueryLog();
    DB::enableQueryLog();
    $this->getJson($url)->assertOk()->assertJsonPath('meta.total', 1);
    $log = DB::getQueryLog();
    DB::disableQueryLog();

    $withoutSettings = 0;
    foreach ($log as $row) {
        $sql = $row['query'];
        if (str_contains($sql, 'from "settings"') || str_contains($sql, 'from `settings`')) {
            continue;
        }
        $withoutSettings++;
    }

    // Depth-1 relational filter uses EXISTS/IN subqueries in the list SELECT — not O(N) PHP loops.
    expect($withoutSettings)->toBeLessThan(25);
});

it('charges API cost budget for each relational filter key', function (): void {
    config([
        'api.cost_limit' => 3,
        'api.cost.base' => 1,
        'api.cost.filter_relation' => 2,
        'api.cost.include' => 2,
        'api.cost.mutation' => 5,
    ]);

    $graph = makeDeepFilterGraph('cost');

    // base 1 + filter_relation 2 = 3 → exhausts budget.
    $first = $this->getJson(
        '/api/v1/collections/'.$graph['slug'].'/items?'.http_build_query([
            'filter' => ['author.name' => ['_eq' => 'Ada']],
        ])
    );
    $first->assertOk();
    expect((int) $first->headers->get('X-RateLimit-Remaining'))->toBe(0);

    $this->getJson('/api/v1/collections/'.$graph['slug'].'/items')
        ->assertStatus(429)
        ->assertJsonPath('message', 'API cost budget exceeded.');
});

<?php

use App\Enums\CollectionPermissionActionEnum;
use App\Models\CollectionItem;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\RateLimiter;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    // Array cache in tests: clear both IPv4 and IPv6 loopback bucket keys.
    RateLimiter::clear('api-cost:127.0.0.1');
    RateLimiter::clear('api-cost:::1');
});

it('does nothing when cost_limit is zero', function (): void {
    config(['api.cost_limit' => 0]);

    $posts = makePostsCollection();
    grantPublicActions($posts, [CollectionPermissionActionEnum::Read]);

    $this->getJson('/api/v1/collections/posts/items')->assertOk();
});

it('charges include tokens more than a plain read and returns 429 when exhausted', function (): void {
    config([
        'api.cost_limit' => 5,
        'api.cost.base' => 1,
        'api.cost.include' => 2,
        'api.cost.mutation' => 5,
    ]);

    $posts = makePostsCollection();
    grantPublicActions($posts, [CollectionPermissionActionEnum::Read]);

    // Plain read cost 1 → remaining budget 4
    $plain = $this->getJson('/api/v1/collections/posts/items');
    $plain->assertOk();
    expect((int) $plain->headers->get('X-RateLimit-Remaining'))->toBe(4);

    // include=files,users → base 1 + 2*2 = 5; attempts(1)+5 > 5 → 429
    $heavy = $this->getJson('/api/v1/collections/posts/items?include=files,users');
    $heavy->assertStatus(429)
        ->assertJsonPath('message', 'API cost budget exceeded.')
        ->assertHeader('Retry-After')
        ->assertHeader('X-RateLimit-Limit', '5')
        ->assertHeader('X-RateLimit-Remaining', '0');
});

it('charges mutations base plus mutation cost', function (): void {
    config([
        'api.cost_limit' => 6,
        'api.cost.base' => 1,
        'api.cost.mutation' => 5,
    ]);

    $posts = makePostsCollection();
    grantPublicActions($posts, [
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Create,
    ]);

    // Mutation cost = 1 + 5 = 6 → exhausts budget exactly, remaining 0
    $create = $this->postJson('/api/v1/collections/posts/items', ['data' => []]);
    $create->assertCreated();
    expect((int) $create->headers->get('X-RateLimit-Remaining'))->toBe(0);

    $this->getJson('/api/v1/collections/posts/items')
        ->assertStatus(429)
        ->assertJsonPath('message', 'API cost budget exceeded.');
});

it('rejects oversized request bodies with 413 when max_body_bytes is set', function (): void {
    config([
        'api.cost_limit' => 0,
        'api.max_body_bytes' => 10,
    ]);

    $posts = makePostsCollection();
    grantPublicActions($posts, [
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Create,
    ]);

    $this->call(
        'POST',
        '/api/v1/collections/posts/items',
        [],
        [],
        [],
        [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'CONTENT_LENGTH' => '64',
        ],
        json_encode(['data' => []], JSON_THROW_ON_ERROR),
    )->assertStatus(413)
        ->assertJsonPath('message', 'Request body too large.');
});

it('caps per_page via api.max_per_page', function (): void {
    config(['api.max_per_page' => 2, 'api.cost_limit' => 0]);

    $posts = makePostsCollection();
    grantPublicActions($posts, [CollectionPermissionActionEnum::Read]);
    CollectionItem::factory()->count(5)->create(['collection_id' => $posts->id]);

    $this->getJson('/api/v1/collections/posts/items?per_page=50')
        ->assertOk()
        ->assertJsonPath('meta.per_page', 2);
});

it('rejects GraphQL queries above GRAPHQL_MAX_COMPLEXITY', function (): void {
    config([
        'lighthouse.security.max_query_complexity' => 1,
        'lighthouse.security.max_query_depth' => 0,
        'lighthouse.validation_cache.enable' => false,
        'api.cost_limit' => 0,
    ]);

    $posts = makePostsCollection();
    grantPublicActions($posts, [CollectionPermissionActionEnum::Read]);

    $response = $this->postJson('/api/graphql', [
        'query' => 'query CostBudgetComplexityProbe { items(collection: "posts") { data { id } meta { total } } }',
    ]);

    expect($response->json('errors'))->not->toBeEmpty();
    $messages = collect($response->json('errors'))->pluck('message')->implode(' ');
    expect(strtolower($messages))->toContain('complexity');
});

it('rejects GraphQL queries deeper than GRAPHQL_MAX_DEPTH', function (): void {
    config([
        'lighthouse.security.max_query_depth' => 2,
        'lighthouse.security.max_query_complexity' => 0,
        'lighthouse.validation_cache.enable' => false,
        'api.cost_limit' => 0,
    ]);

    // Introspection nesting reliably exceeds depth 2 regardless of CMS schema shape.
    $response = $this->postJson('/api/graphql', [
        'query' => 'query CostBudgetDepthProbe { __schema { types { fields { type { name } } } } }',
    ]);

    expect($response->json('errors'))->not->toBeEmpty();
    $messages = collect($response->json('errors'))->pluck('message')->implode(' ');
    expect(strtolower($messages))->toContain('depth');
});

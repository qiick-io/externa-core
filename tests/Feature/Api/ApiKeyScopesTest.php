<?php

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Enums\FilePermissionActionEnum;
use App\GraphQL\Queries\ItemQuery;
use App\GraphQL\Queries\ItemsQuery;
use App\Jobs\WarmFileThumbnailJob;
use App\Models\ApiKey;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\File;
use App\Services\Api\FilePermissionGuard;
use App\Services\Api\PublicApiResponseCache;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Support\Api\ApiAccess;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

/**
 * @param  array<string, mixed>  $data
 */
function syncScopedItem(CollectionItem $item, Collection $collection, array $data): void
{
    $collection = $collection->relationLoaded('fields')
        ? $collection
        : $collection->fresh(['fields']);

    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection,
        app(CollectionItemDataNormalizer::class)->normalize($collection, $data, true),
    );
}

/**
 * Cache key shaped exactly like {@see ItemQuery}.
 */
function graphqlItemCacheKey(Collection $collection, string $itemId, ApiAccess $access): string
{
    $cache = app(PublicApiResponseCache::class);
    $roleId = $access->roleId();
    $hash = $cache->hash([
        'locale' => request()->query('locale'),
        'include_all_translations' => request()->boolean('include_all_translations'),
        'role_id' => $roleId,
        'file_grants' => app(FilePermissionGuard::class)->grantsForRole($roleId),
        ...$access->responseCacheScopeFactors(),
        'surface' => 'graphql',
    ]);

    return $cache->itemKey(
        $collection->slug,
        $itemId,
        $cache->version((int) $collection->id),
        $hash,
    );
}

/**
 * Cache key shaped exactly like {@see ItemsQuery} (defaults).
 */
function graphqlItemsCacheKey(Collection $collection, ApiAccess $access): string
{
    $cache = app(PublicApiResponseCache::class);
    $roleId = $access->roleId();
    $hash = $cache->hash([
        'filter' => [],
        'page' => 1,
        'per_page' => min(15, max(1, (int) config('api.max_per_page', 100))),
        'locale' => request()->query('locale'),
        'include_all_translations' => request()->boolean('include_all_translations'),
        'role_id' => $roleId,
        'file_grants' => app(FilePermissionGuard::class)->grantsForRole($roleId),
        ...$access->responseCacheScopeFactors(),
        'surface' => 'graphql',
    ]);

    return $cache->itemsKey(
        $collection->slug,
        $cache->version((int) $collection->id),
        $hash,
    );
}

/**
 * Same as ItemQuery hash factors but without api_key_scopes (regression probe).
 */
function graphqlItemCacheKeyWithoutScopes(Collection $collection, string $itemId, ApiAccess $access): string
{
    $cache = app(PublicApiResponseCache::class);
    $roleId = $access->roleId();
    $hash = $cache->hash([
        'locale' => request()->query('locale'),
        'include_all_translations' => request()->boolean('include_all_translations'),
        'role_id' => $roleId,
        'file_grants' => app(FilePermissionGuard::class)->grantsForRole($roleId),
        'surface' => 'graphql',
    ]);

    return $cache->itemKey(
        $collection->slug,
        $itemId,
        $cache->version((int) $collection->id),
        $hash,
    );
}

/**
 * Same as ItemsQuery hash factors but without api_key_scopes (regression probe).
 */
function graphqlItemsCacheKeyWithoutScopes(Collection $collection, ApiAccess $access): string
{
    $cache = app(PublicApiResponseCache::class);
    $roleId = $access->roleId();
    $hash = $cache->hash([
        'filter' => [],
        'page' => 1,
        'per_page' => min(15, max(1, (int) config('api.max_per_page', 100))),
        'locale' => request()->query('locale'),
        'include_all_translations' => request()->boolean('include_all_translations'),
        'role_id' => $roleId,
        'file_grants' => app(FilePermissionGuard::class)->grantsForRole($roleId),
        'surface' => 'graphql',
    ]);

    return $cache->itemsKey(
        $collection->slug,
        $cache->version((int) $collection->id),
        $hash,
    );
}

it('legacy keys without scopes behave as today', function (): void {
    $posts = makePostsCollection();
    $pages = CollectionItem::factory()->create([
        'collection_id' => Collection::query()->create([
            'name' => 'Pages',
            'slug' => 'pages',
            'is_singleton' => false,
            'sort_order' => 2,
        ])->id,
    ])->collection;

    $item = CollectionItem::factory()->create(['collection_id' => $posts->id]);
    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $posts, [
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Create,
        CollectionPermissionActionEnum::Update,
        CollectionPermissionActionEnum::Delete,
    ]);
    grantRoleActions($auth['role'], $pages, [CollectionPermissionActionEnum::Read]);

    $asKey = fn () => $this->withToken($auth['plain']);

    $asKey()->getJson('/api/v1/collections')->assertOk()
        ->assertJsonFragment(['slug' => 'posts'])
        ->assertJsonFragment(['slug' => 'pages']);
    $asKey()->getJson("/api/v1/collections/posts/items/{$item->id}")->assertOk();
    $asKey()->postJson('/api/v1/collections/posts/items', ['data' => []])->assertCreated();
});

it('rejects out-of-scope collection with 403 on REST', function (): void {
    $posts = makePostsCollection();
    $pages = Collection::query()->create([
        'name' => 'Pages',
        'slug' => 'pages',
        'is_singleton' => false,
        'sort_order' => 2,
    ]);
    $pageItem = CollectionItem::factory()->create(['collection_id' => $pages->id]);

    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $posts, [CollectionPermissionActionEnum::Read]);
    grantRoleActions($auth['role'], $pages, [CollectionPermissionActionEnum::Read]);
    $auth['key']->forceFill(['collection_slugs' => ['posts']])->save();

    $asKey = fn () => $this->withToken($auth['plain']);

    $asKey()->getJson('/api/v1/collections')
        ->assertOk()
        ->assertJsonFragment(['slug' => 'posts'])
        ->assertJsonMissing(['slug' => 'pages']);

    $asKey()->getJson('/api/v1/collections/posts/items')->assertOk();
    $asKey()->getJson('/api/v1/collections/pages')->assertForbidden();
    $asKey()->getJson("/api/v1/collections/pages/items/{$pageItem->id}")->assertForbidden();
});

it('rejects writes when key is read_only on REST', function (): void {
    $posts = makePostsCollection();
    $item = CollectionItem::factory()->create(['collection_id' => $posts->id]);
    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $posts, [
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Create,
        CollectionPermissionActionEnum::Update,
        CollectionPermissionActionEnum::Delete,
    ]);
    $auth['key']->forceFill(['read_only' => true])->save();

    $asKey = fn () => $this->withToken($auth['plain']);

    $asKey()->getJson("/api/v1/collections/posts/items/{$item->id}")->assertOk();
    $asKey()->postJson('/api/v1/collections/posts/items', ['data' => []])->assertForbidden();
    $asKey()->patchJson("/api/v1/collections/posts/items/{$item->id}", ['data' => []])->assertForbidden();
    $asKey()->deleteJson("/api/v1/collections/posts/items/{$item->id}")->assertForbidden();
});

it('scopes never grant more than the role', function (): void {
    $posts = makePostsCollection();
    $item = CollectionItem::factory()->create(['collection_id' => $posts->id]);
    $auth = makeApiKeyForRole();
    // Role has no grants; key scopes claim posts + writes — still denied.
    $auth['key']->forceFill([
        'collection_slugs' => ['posts'],
        'read_only' => false,
    ])->save();

    $this->withToken($auth['plain'])
        ->getJson("/api/v1/collections/posts/items/{$item->id}")
        ->assertForbidden();
});

it('does not expand include relations from out-of-scope collections', function (): void {
    $authors = Collection::query()->create([
        'name' => 'Authors',
        'slug' => 'authors',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $authors->id,
        'name' => 'name',
        'type' => FieldTypeEnum::String,
    ]);
    $author = $authors->items()->create([]);
    app(CollectionItemValuesWriter::class)->sync(
        $author,
        $authors->fresh(['fields']),
        app(CollectionItemDataNormalizer::class)->normalize($authors->fresh(['fields']), ['name' => 'Secret Author'], true),
    );

    $blog = Collection::query()->create([
        'name' => 'Blog',
        'slug' => 'blog',
        'is_singleton' => false,
        'sort_order' => 2,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $blog->id,
        'name' => 'author',
        'type' => FieldTypeEnum::ManyToOne,
        'settings' => ['related_collection_id' => $authors->id],
    ]);
    $post = $blog->items()->create([]);
    app(CollectionItemValuesWriter::class)->sync(
        $post,
        $blog->fresh(['fields']),
        app(CollectionItemDataNormalizer::class)->normalize($blog->fresh(['fields']), ['author' => $author->id], true),
    );

    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $blog, [CollectionPermissionActionEnum::Read]);
    grantRoleActions($auth['role'], $authors, [CollectionPermissionActionEnum::Read]);
    $auth['key']->forceFill(['collection_slugs' => ['blog']])->save();

    $response = $this->withToken($auth['plain'])
        ->getJson("/api/v1/collections/blog/items/{$post->id}?include=author")
        ->assertOk();

    // Same shape as role-unreadable relations: bare id, no nested payload.
    expect($response->json('data.data.author'))->toBe($author->id)
        ->and(is_array($response->json('data.data.author')))->toBeFalse()
        ->and(json_encode($response->json()))->not->toContain('Secret Author');
});

it('partitions response cache for keys that share a role but differ in scopes', function (): void {
    $authors = Collection::query()->create([
        'name' => 'Authors',
        'slug' => 'cache-authors',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $authors->id,
        'name' => 'name',
        'type' => FieldTypeEnum::String,
    ]);
    $author = $authors->items()->create([]);
    app(CollectionItemValuesWriter::class)->sync(
        $author,
        $authors->fresh(['fields']),
        app(CollectionItemDataNormalizer::class)->normalize($authors->fresh(['fields']), ['name' => 'Cached Author'], true),
    );

    $blog = Collection::query()->create([
        'name' => 'Blog',
        'slug' => 'cache-blog',
        'is_singleton' => false,
        'sort_order' => 2,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $blog->id,
        'name' => 'author',
        'type' => FieldTypeEnum::ManyToOne,
        'settings' => ['related_collection_id' => $authors->id],
    ]);
    $post = $blog->items()->create([]);
    app(CollectionItemValuesWriter::class)->sync(
        $post,
        $blog->fresh(['fields']),
        app(CollectionItemDataNormalizer::class)->normalize($blog->fresh(['fields']), ['author' => $author->id], true),
    );

    $wide = makeApiKeyForRole();
    grantRoleActions($wide['role'], $blog, [CollectionPermissionActionEnum::Read]);
    grantRoleActions($wide['role'], $authors, [CollectionPermissionActionEnum::Read]);

    // Second key: same role, blog-only allowlist.
    $secret = ApiKey::generateSecret();
    $narrowKey = ApiKey::query()->create([
        'name' => 'Narrow',
        'key_prefix' => $secret['prefix'],
        'key_hash' => $secret['hash'],
        'role_id' => $wide['role']->id,
        'collection_slugs' => ['cache-blog'],
        'read_only' => false,
    ]);

    $url = "/api/v1/collections/cache-blog/items/{$post->id}?include=author";

    // Wide key warms cache with expanded author.
    $this->withToken($wide['plain'])->getJson($url)->assertOk()
        ->assertJsonPath('data.data.author.data.name', 'Cached Author');

    // Narrow key must not reuse that payload.
    $narrow = $this->withToken($secret['plain'])->getJson($url)->assertOk();
    expect($narrow->json('data.data.author'))->toBe($author->id)
        ->and(is_array($narrow->json('data.data.author')))->toBeFalse()
        ->and(json_encode($narrow->json()))->not->toContain('Cached Author');

    expect($narrowKey->fresh()->collection_slugs)->toBe(['cache-blog']);
});

it('read_only key can include in-scope relations but cannot write', function (): void {
    $authors = Collection::query()->create([
        'name' => 'Authors',
        'slug' => 'ro-authors',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $authors->id,
        'name' => 'name',
        'type' => FieldTypeEnum::String,
    ]);
    $author = $authors->items()->create([]);
    app(CollectionItemValuesWriter::class)->sync(
        $author,
        $authors->fresh(['fields']),
        app(CollectionItemDataNormalizer::class)->normalize($authors->fresh(['fields']), ['name' => 'Readable'], true),
    );

    $blog = Collection::query()->create([
        'name' => 'Blog',
        'slug' => 'ro-blog',
        'is_singleton' => false,
        'sort_order' => 2,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $blog->id,
        'name' => 'author',
        'type' => FieldTypeEnum::ManyToOne,
        'settings' => ['related_collection_id' => $authors->id],
    ]);
    $post = $blog->items()->create([]);
    app(CollectionItemValuesWriter::class)->sync(
        $post,
        $blog->fresh(['fields']),
        app(CollectionItemDataNormalizer::class)->normalize($blog->fresh(['fields']), ['author' => $author->id], true),
    );

    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $blog, [
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Create,
        CollectionPermissionActionEnum::Update,
        CollectionPermissionActionEnum::Delete,
    ]);
    grantRoleActions($auth['role'], $authors, [CollectionPermissionActionEnum::Read]);
    $auth['key']->forceFill([
        'collection_slugs' => ['ro-blog', 'ro-authors'],
        'read_only' => true,
    ])->save();

    $asKey = fn () => $this->withToken($auth['plain']);

    $asKey()->getJson("/api/v1/collections/ro-blog/items/{$post->id}?include=author")
        ->assertOk()
        ->assertJsonPath('data.data.author.data.name', 'Readable');

    $asKey()->postJson('/api/v1/collections/ro-blog/items', ['data' => []])->assertForbidden();
    $asKey()->patchJson("/api/v1/collections/ro-blog/items/{$post->id}", ['data' => []])->assertForbidden();
    $asKey()->deleteJson("/api/v1/collections/ro-blog/items/{$post->id}")->assertForbidden();
});

it('enforces collection allowlist and read_only on GraphQL', function (): void {
    $posts = makePostsCollection();
    CollectionField::factory()->create([
        'collection_id' => $posts->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $pages = Collection::query()->create([
        'name' => 'Pages',
        'slug' => 'pages',
        'is_singleton' => false,
        'sort_order' => 2,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $pages->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $posts, [
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Create,
    ]);
    grantRoleActions($auth['role'], $pages, [
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Create,
    ]);
    $auth['key']->forceFill([
        'collection_slugs' => ['posts'],
        'read_only' => true,
    ])->save();

    $item = $posts->items()->create([]);
    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $posts,
        app(CollectionItemDataNormalizer::class)->normalize($posts, ['title' => 'Hi'], true),
    );

    $asKey = fn () => $this->withToken($auth['plain']);

    $list = $asKey()->postJson('/api/graphql', [
        'query' => 'query { collections { slug } }',
    ]);
    $list->assertOk();
    $slugs = collect($list->json('data.collections'))->pluck('slug')->all();
    expect($slugs)->toContain('posts')->not->toContain('pages');

    $denied = $asKey()->postJson('/api/graphql', [
        'query' => 'query { items(collection: "pages") { data { id } } }',
    ]);
    expect(in_array($denied->status(), [200, 403], true))->toBeTrue();
    if ($denied->status() === 200) {
        expect($denied->json('errors'))->not->toBeEmpty();
    }

    $write = $asKey()->postJson('/api/graphql', [
        'query' => 'mutation { createItem(collection: "posts", data: { title: "Nope" }) { id } }',
    ]);
    expect(in_array($write->status(), [200, 403], true))->toBeTrue();
    if ($write->status() === 200) {
        expect($write->json('errors'))->not->toBeEmpty();
    }
});

it('hides out-of-scope relations on list include prewarm path', function (): void {
    $authors = Collection::query()->create([
        'name' => 'Authors',
        'slug' => 'list-authors',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $authors->id,
        'name' => 'name',
        'type' => FieldTypeEnum::String,
    ]);
    $authorA = $authors->items()->create([]);
    $authorB = $authors->items()->create([]);
    syncScopedItem($authorA, $authors, ['name' => 'Secret Ada']);
    syncScopedItem($authorB, $authors, ['name' => 'Secret Grace']);

    $blog = Collection::query()->create([
        'name' => 'Blog',
        'slug' => 'list-blog',
        'is_singleton' => false,
        'sort_order' => 2,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $blog->id,
        'name' => 'author',
        'type' => FieldTypeEnum::ManyToOne,
        'settings' => ['related_collection_id' => $authors->id],
    ]);
    $postA = $blog->items()->create([]);
    $postB = $blog->items()->create([]);
    syncScopedItem($postA, $blog, ['author' => $authorA->id]);
    syncScopedItem($postB, $blog, ['author' => $authorB->id]);

    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $blog, [CollectionPermissionActionEnum::Read]);
    grantRoleActions($auth['role'], $authors, [CollectionPermissionActionEnum::Read]);
    $auth['key']->forceFill(['collection_slugs' => ['list-blog']])->save();

    $response = $this->withToken($auth['plain'])
        ->getJson('/api/v1/collections/list-blog/items?per_page=2&include=author')
        ->assertOk();

    expect($response->json('meta.total'))->toBe(2);

    foreach ($response->json('data') as $row) {
        expect($row['data']['author'])->toBeIn([$authorA->id, $authorB->id])
            ->and(is_array($row['data']['author']))->toBeFalse();
    }

    expect(json_encode($response->json()))
        ->not->toContain('Secret Ada')
        ->not->toContain('Secret Grace');
});

it('returns bare ids for out-of-scope m2m includes', function (): void {
    $tags = Collection::query()->create([
        'name' => 'Tags',
        'slug' => 'scope-tags',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $tags->id,
        'name' => 'label',
        'type' => FieldTypeEnum::String,
    ]);
    $tag = $tags->items()->create([]);
    syncScopedItem($tag, $tags, ['label' => 'Secret Tag']);

    $posts = Collection::query()->create([
        'name' => 'Posts',
        'slug' => 'scope-m2m-posts',
        'is_singleton' => false,
        'sort_order' => 2,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $posts->id,
        'name' => 'categories',
        'type' => FieldTypeEnum::ManyToMany,
        'settings' => ['related_collection_id' => $tags->id],
    ]);
    $post = $posts->items()->create([]);
    syncScopedItem($post, $posts, [
        'categories' => [
            ['related_item_id' => $tag->id, 'meta' => ['sort' => 1]],
        ],
    ]);

    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $posts, [CollectionPermissionActionEnum::Read]);
    grantRoleActions($auth['role'], $tags, [CollectionPermissionActionEnum::Read]);
    $auth['key']->forceFill(['collection_slugs' => ['scope-m2m-posts']])->save();

    $response = $this->withToken($auth['plain'])
        ->getJson("/api/v1/collections/scope-m2m-posts/items/{$post->id}?include=categories")
        ->assertOk();

    expect($response->json('data.data.categories.0.related_item_id'))->toBe($tag->id)
        ->and($response->json('data.data.categories.0'))->not->toHaveKey('item')
        ->and(json_encode($response->json()))->not->toContain('Secret Tag');
});

it('returns bare ids for out-of-scope m2a includes', function (): void {
    $blocks = Collection::query()->create([
        'name' => 'Blocks',
        'slug' => 'scope-blocks',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $blocks->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $block = $blocks->items()->create([]);
    syncScopedItem($block, $blocks, ['title' => 'Secret Block']);

    $pages = Collection::query()->create([
        'name' => 'Pages',
        'slug' => 'scope-m2a-pages',
        'is_singleton' => false,
        'sort_order' => 2,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $pages->id,
        'name' => 'content',
        'type' => FieldTypeEnum::M2a,
        'settings' => [
            'allowed_collection_ids' => [$blocks->id],
        ],
    ]);
    $page = $pages->items()->create([]);
    syncScopedItem($page, $pages, [
        'content' => [
            [
                'related_collection_id' => $blocks->id,
                'related_item_id' => $block->id,
            ],
        ],
    ]);

    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $pages, [CollectionPermissionActionEnum::Read]);
    grantRoleActions($auth['role'], $blocks, [CollectionPermissionActionEnum::Read]);
    $auth['key']->forceFill(['collection_slugs' => ['scope-m2a-pages']])->save();

    $response = $this->withToken($auth['plain'])
        ->getJson("/api/v1/collections/scope-m2a-pages/items/{$page->id}?include=content")
        ->assertOk();

    expect($response->json('data.data.content.0.related_item_id'))->toBe($block->id)
        ->and($response->json('data.data.content.0.related_collection_id'))->toBe($blocks->id)
        ->and($response->json('data.data.content.0'))->not->toHaveKey('item')
        ->and(json_encode($response->json()))->not->toContain('Secret Block');
});

it('does not share index response cache across keys with different scopes', function (): void {
    $authors = Collection::query()->create([
        'name' => 'Authors',
        'slug' => 'idx-authors',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $authors->id,
        'name' => 'name',
        'type' => FieldTypeEnum::String,
    ]);
    $author = $authors->items()->create([]);
    syncScopedItem($author, $authors, ['name' => 'Index Cached Author']);

    $blog = Collection::query()->create([
        'name' => 'Blog',
        'slug' => 'idx-blog',
        'is_singleton' => false,
        'sort_order' => 2,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $blog->id,
        'name' => 'author',
        'type' => FieldTypeEnum::ManyToOne,
        'settings' => ['related_collection_id' => $authors->id],
    ]);
    $post = $blog->items()->create([]);
    syncScopedItem($post, $blog, ['author' => $author->id]);

    $wide = makeApiKeyForRole();
    grantRoleActions($wide['role'], $blog, [CollectionPermissionActionEnum::Read]);
    grantRoleActions($wide['role'], $authors, [CollectionPermissionActionEnum::Read]);

    $secret = ApiKey::generateSecret();
    ApiKey::query()->create([
        'name' => 'Narrow index',
        'key_prefix' => $secret['prefix'],
        'key_hash' => $secret['hash'],
        'role_id' => $wide['role']->id,
        'collection_slugs' => ['idx-blog'],
        'read_only' => false,
    ]);

    $url = '/api/v1/collections/idx-blog/items?per_page=10&include=author';

    $this->withToken($wide['plain'])->getJson($url)->assertOk()
        ->assertJsonPath('data.0.data.author.data.name', 'Index Cached Author');

    $narrow = $this->withToken($secret['plain'])->getJson($url)->assertOk();
    expect($narrow->json('data.0.data.author'))->toBe($author->id)
        ->and(is_array($narrow->json('data.0.data.author')))->toBeFalse()
        ->and(json_encode($narrow->json()))->not->toContain('Index Cached Author');
});

it('partitions GraphQL ItemQuery and ItemsQuery cache keys by api key scopes', function (): void {
    $posts = makePostsCollection();
    CollectionField::factory()->create([
        'collection_id' => $posts->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = $posts->items()->create([]);
    syncScopedItem($item, $posts, ['title' => 'Cached']);

    $wide = makeApiKeyForRole();
    grantRoleActions($wide['role'], $posts, [CollectionPermissionActionEnum::Read]);

    $emptySecret = ApiKey::generateSecret();
    $emptyKey = ApiKey::query()->create([
        'name' => 'Empty slugs gql',
        'key_prefix' => $emptySecret['prefix'],
        'key_hash' => $emptySecret['hash'],
        'role_id' => $wide['role']->id,
        'collection_slugs' => [],
        'read_only' => false,
    ]);

    $narrowSecret = ApiKey::generateSecret();
    $narrowKey = ApiKey::query()->create([
        'name' => 'Narrow gql',
        'key_prefix' => $narrowSecret['prefix'],
        'key_hash' => $narrowSecret['hash'],
        'role_id' => $wide['role']->id,
        'collection_slugs' => ['posts'],
        'read_only' => false,
    ]);

    $readOnlySecret = ApiKey::generateSecret();
    $readOnlyKey = ApiKey::query()->create([
        'name' => 'RO gql',
        'key_prefix' => $readOnlySecret['prefix'],
        'key_hash' => $readOnlySecret['hash'],
        'role_id' => $wide['role']->id,
        'collection_slugs' => ['posts'],
        'read_only' => true,
    ]);

    $wideAccess = new ApiAccess('api_key', $wide['role'], $wide['key']);
    $emptyAccess = new ApiAccess('api_key', $wide['role'], $emptyKey);
    $narrowAccess = new ApiAccess('api_key', $wide['role'], $narrowKey);
    $readOnlyAccess = new ApiAccess('api_key', $wide['role'], $readOnlyKey);

    $itemId = (string) $item->id;

    // null vs [] must not collapse — same formula ItemQuery/ItemsQuery use.
    expect(graphqlItemCacheKey($posts, $itemId, $wideAccess))
        ->not->toBe(graphqlItemCacheKey($posts, $itemId, $emptyAccess))
        ->and(graphqlItemsCacheKey($posts, $wideAccess))
        ->not->toBe(graphqlItemsCacheKey($posts, $emptyAccess))
        ->and(graphqlItemCacheKey($posts, $itemId, $narrowAccess))
        ->not->toBe(graphqlItemCacheKey($posts, $itemId, $readOnlyAccess))
        ->and(graphqlItemsCacheKey($posts, $narrowAccess))
        ->not->toBe(graphqlItemsCacheKey($posts, $readOnlyAccess));

    $itemQuery = <<<'GQL'
        query ($c: String!, $id: ID!) {
            item(collection: $c, id: $id) { id }
        }
        GQL;
    $itemsQuery = <<<'GQL'
        query ($c: String!) {
            items(collection: $c) { data { id } meta { total } }
        }
        GQL;

    foreach (
        [
            [$wide['plain'], $wideAccess],
            [$narrowSecret['plain'], $narrowAccess],
            [$readOnlySecret['plain'], $readOnlyAccess],
        ] as [$plain, $access]
    ) {
        $this->withToken($plain)->postJson('/api/graphql', [
            'query' => $itemQuery,
            'variables' => ['c' => 'posts', 'id' => $itemId],
        ])->assertOk()->assertJsonPath('data.item.id', $itemId);

        $this->withToken($plain)->postJson('/api/graphql', [
            'query' => $itemsQuery,
            'variables' => ['c' => 'posts'],
        ])->assertOk()->assertJsonPath('data.items.meta.total', 1);

        // Would fail if ItemQuery/ItemsQuery dropped responseCacheScopeFactors().
        expect(Cache::has(graphqlItemCacheKey($posts, $itemId, $access)))->toBeTrue()
            ->and(Cache::has(graphqlItemCacheKeyWithoutScopes($posts, $itemId, $access)))->toBeFalse()
            ->and(Cache::has(graphqlItemsCacheKey($posts, $access)))->toBeTrue()
            ->and(Cache::has(graphqlItemsCacheKeyWithoutScopes($posts, $access)))->toBeFalse();
    }

    // Empty allowlist cannot read posts (authorize before cache); key shape still differs from null.
    expect($emptyKey->fresh()->collection_slugs)->toBe([])
        ->and($wide['key']->fresh()->collection_slugs)->toBeNull();
});

it('rejects file writes when key is read_only but still allows reads', function (): void {
    Storage::fake('assets');

    $auth = makeApiKeyForRole();
    grantFileActions($auth['role'], [
        FilePermissionActionEnum::Read,
        FilePermissionActionEnum::Create,
        FilePermissionActionEnum::Update,
        FilePermissionActionEnum::Delete,
    ]);
    $auth['key']->forceFill(['read_only' => true])->save();

    $file = makeStoredFile('ro-file.jpg');
    $asKey = fn () => $this->withToken($auth['plain']);

    $asKey()->getJson('/api/v1/files')->assertOk();
    $asKey()->getJson("/api/v1/files/{$file->id}")->assertOk()
        ->assertJsonPath('data.id', $file->id);

    $asKey()->post('/api/v1/files', [
        'file' => UploadedFile::fake()->image('blocked.png', 40, 30),
    ], ['Accept' => 'application/json'])->assertForbidden();

    $asKey()->patchJson("/api/v1/files/{$file->id}", ['title' => 'Nope'])->assertForbidden();
    $asKey()->deleteJson("/api/v1/files/{$file->id}")->assertForbidden();

    expect(File::query()->find($file->id))->not->toBeNull()
        ->and($file->fresh()->title)->not->toBe('Nope');
});

it('allows file writes for an unscoped key when the role grants them', function (): void {
    Storage::fake('assets');
    Queue::fake([WarmFileThumbnailJob::class]);

    $auth = makeApiKeyForRole();
    grantFileActions($auth['role'], [
        FilePermissionActionEnum::Read,
        FilePermissionActionEnum::Create,
        FilePermissionActionEnum::Update,
        FilePermissionActionEnum::Delete,
    ]);
    // Unscoped: null collection_slugs, not read_only (legacy key shape).
    expect($auth['key']->collection_slugs)->toBeNull()
        ->and((bool) $auth['key']->read_only)->toBeFalse();

    $file = makeStoredFile('writable.jpg');
    $asKey = fn () => $this->withToken($auth['plain']);

    $asKey()->post('/api/v1/files', [
        'file' => UploadedFile::fake()->image('upload.png', 40, 30),
    ], ['Accept' => 'application/json'])->assertCreated();

    $asKey()->patchJson("/api/v1/files/{$file->id}", ['title' => 'Hero'])
        ->assertOk()
        ->assertJsonPath('data.title', 'Hero');

    $asKey()->deleteJson("/api/v1/files/{$file->id}")->assertNoContent();
    expect(File::query()->find($file->id))->toBeNull();
});

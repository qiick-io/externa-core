<?php

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

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

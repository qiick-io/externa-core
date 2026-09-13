<?php

use App\Enums\CollectionPermissionAction;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Api\PublicApiResponseCache;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\Settings\SettingsRepository;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\DB;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

/**
 * @return array{collection: Collection, field: CollectionField, slug: string}
 */
function freshnessCollection(string $slugPrefix = 'fresh'): array
{
    $slug = $slugPrefix.'-'.uniqid();
    $collection = Collection::query()->create([
        'name' => 'Fresh '.$slug,
        'slug' => $slug,
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);
    grantPublicActions($collection, [
        CollectionPermissionAction::Read,
        CollectionPermissionAction::Create,
        CollectionPermissionAction::Update,
        CollectionPermissionAction::Delete,
    ]);

    return ['collection' => $collection, 'field' => $field, 'slug' => $slug];
}

function syncItemValues(CollectionItem $item, Collection $collection, array $data): void
{
    $normalized = app(CollectionItemDataNormalizer::class)->normalize($collection, $data, $item->wasRecentlyCreated);
    app(CollectionItemValuesWriter::class)->sync($item, $collection, $normalized);
}

/**
 * @return array{data: mixed, meta?: mixed}
 */
function gql(string $query, array $variables = []): array
{
    $response = test()->postJson('/api/graphql', array_filter([
        'query' => $query,
        'variables' => $variables === [] ? null : $variables,
    ]));

    $response->assertOk();
    expect($response->json('errors'))->toBeNull();

    return $response->json('data');
}

it('keeps REST collection show fresh after field schema change', function (): void {
    ['collection' => $collection, 'slug' => $slug] = freshnessCollection('coll-show');

    $warm = $this->getJson("/api/v1/collections/{$slug}")->assertOk();
    expect($warm->json('data.fields'))->toHaveCount(1)
        ->and(collect($warm->json('data.fields'))->pluck('name')->all())->toBe(['title']);

    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'type' => FieldTypeEnum::String,
    ]);

    $fresh = $this->getJson("/api/v1/collections/{$slug}")->assertOk();
    expect(collect($fresh->json('data.fields'))->pluck('name')->sort()->values()->all())
        ->toBe(['status', 'title']);

    // Re-warm still B
    $again = $this->getJson("/api/v1/collections/{$slug}")->assertOk();
    expect(collect($again->json('data.fields'))->pluck('name')->sort()->values()->all())
        ->toBe(['status', 'title']);
});

it('keeps GraphQL collection fresh after name change when slug bumps version', function (): void {
    // Name alone does not bump; slug rename does (plan: bump on rename slug).
    ['collection' => $collection, 'slug' => $slug] = freshnessCollection('gql-coll');

    $warm = gql('query ($s: String!) { collection(slug: $s) { id name slug } }', ['s' => $slug]);
    expect($warm['collection']['name'])->toBe($collection->name);

    $newSlug = $slug.'-renamed';
    $collection->update(['name' => 'Renamed Fresh', 'slug' => $newSlug]);

    $fresh = gql('query ($s: String!) { collection(slug: $s) { id name slug } }', ['s' => $newSlug]);
    expect($fresh['collection']['name'])->toBe('Renamed Fresh')
        ->and($fresh['collection']['slug'])->toBe($newSlug);
});

it('keeps REST items index and item show fresh after create update delete restore', function (): void {
    ['collection' => $collection, 'slug' => $slug] = freshnessCollection('rest-crud');

    $this->getJson("/api/v1/collections/{$slug}/items")
        ->assertOk()
        ->assertJsonPath('meta.total', 0);

    $created = $this->postJson("/api/v1/collections/{$slug}/items", [
        'data' => ['title' => 'Alpha'],
    ])->assertCreated();
    $itemId = $created->json('data.id');

    $listAfterCreate = $this->getJson("/api/v1/collections/{$slug}/items")->assertOk();
    expect($listAfterCreate->json('meta.total'))->toBe(1)
        ->and($listAfterCreate->json('data.0.data.title'))->toBe('Alpha');

    $showWarm = $this->getJson("/api/v1/collections/{$slug}/items/{$itemId}")->assertOk();
    expect($showWarm->json('data.data.title'))->toBe('Alpha');

    $this->patchJson("/api/v1/collections/{$slug}/items/{$itemId}", [
        'data' => ['title' => 'Beta'],
    ])->assertOk()->assertJsonPath('data.data.title', 'Beta');

    $showFresh = $this->getJson("/api/v1/collections/{$slug}/items/{$itemId}")->assertOk();
    expect($showFresh->json('data.data.title'))->toBe('Beta');

    $listFresh = $this->getJson("/api/v1/collections/{$slug}/items")->assertOk();
    expect($listFresh->json('data.0.data.title'))->toBe('Beta');

    // Second GET still B (cache hit of fresh)
    expect($this->getJson("/api/v1/collections/{$slug}/items/{$itemId}")->json('data.data.title'))
        ->toBe('Beta');

    $this->deleteJson("/api/v1/collections/{$slug}/items/{$itemId}")->assertNoContent();

    $this->getJson("/api/v1/collections/{$slug}/items/{$itemId}")->assertNotFound();
    expect($this->getJson("/api/v1/collections/{$slug}/items")->json('meta.total'))->toBe(0);

    CollectionItem::withTrashed()->findOrFail($itemId)->restore();

    expect($this->getJson("/api/v1/collections/{$slug}/items")->json('meta.total'))->toBe(1);
    $this->getJson("/api/v1/collections/{$slug}/items/{$itemId}")
        ->assertOk()
        ->assertJsonPath('data.data.title', 'Beta');
});

it('keeps GraphQL items and item fresh after create update delete', function (): void {
    ['slug' => $slug] = freshnessCollection('gql-crud');

    $warm = gql(<<<'GQL'
        query ($c: String!) {
            items(collection: $c) { data { id data } meta { total } }
        }
        GQL, ['c' => $slug]);
    expect($warm['items']['meta']['total'])->toBe(0);

    $created = gql(<<<'GQL'
        mutation ($c: String!, $d: JSON!) {
            createItem(collection: $c, data: $d) { id data }
        }
        GQL, ['c' => $slug, 'd' => ['title' => 'GqlA']]);
    $itemId = $created['createItem']['id'];

    $list = gql(<<<'GQL'
        query ($c: String!) {
            items(collection: $c) { data { id data } meta { total } }
        }
        GQL, ['c' => $slug]);
    expect($list['items']['meta']['total'])->toBe(1)
        ->and($list['items']['data'][0]['data']['title'])->toBe('GqlA');

    $itemWarm = gql(<<<'GQL'
        query ($c: String!, $id: ID!) {
            item(collection: $c, id: $id) { id data }
        }
        GQL, ['c' => $slug, 'id' => $itemId]);
    expect($itemWarm['item']['data']['title'])->toBe('GqlA');

    gql(<<<'GQL'
        mutation ($c: String!, $id: ID!, $d: JSON!) {
            updateItem(collection: $c, id: $id, data: $d) { id data }
        }
        GQL, ['c' => $slug, 'id' => $itemId, 'd' => ['title' => 'GqlB']]);

    $itemFresh = gql(<<<'GQL'
        query ($c: String!, $id: ID!) {
            item(collection: $c, id: $id) { id data }
        }
        GQL, ['c' => $slug, 'id' => $itemId]);
    expect($itemFresh['item']['data']['title'])->toBe('GqlB');

    $listFresh = gql(<<<'GQL'
        query ($c: String!) {
            items(collection: $c) { data { data } meta { total } }
        }
        GQL, ['c' => $slug]);
    expect($listFresh['items']['data'][0]['data']['title'])->toBe('GqlB');

    gql(<<<'GQL'
        mutation ($c: String!, $id: ID!) {
            deleteItem(collection: $c, id: $id)
        }
        GQL, ['c' => $slug, 'id' => $itemId]);

    $gone = gql(<<<'GQL'
        query ($c: String!, $id: ID!) {
            item(collection: $c, id: $id) { id }
            items(collection: $c) { meta { total } }
        }
        GQL, ['c' => $slug, 'id' => $itemId]);
    expect($gone['item'])->toBeNull()
        ->and($gone['items']['meta']['total'])->toBe(0);
});

it('updates filtered REST list when item enters or leaves the filter', function (): void {
    ['collection' => $collection, 'slug' => $slug] = freshnessCollection('filter');

    $item = $collection->items()->create([]);
    syncItemValues($item, $collection, ['title' => 'draft-one']);

    $filterUrl = "/api/v1/collections/{$slug}/items?".http_build_query([
        'filter' => ['title' => 'published'],
    ]);

    expect($this->getJson($filterUrl)->json('meta.total'))->toBe(0);

    $this->patchJson("/api/v1/collections/{$slug}/items/{$item->id}", [
        'data' => ['title' => 'published'],
    ])->assertOk();

    $entered = $this->getJson($filterUrl)->assertOk();
    expect($entered->json('meta.total'))->toBe(1)
        ->and($entered->json('data.0.id'))->toBe($item->id);

    $this->patchJson("/api/v1/collections/{$slug}/items/{$item->id}", [
        'data' => ['title' => 'archived'],
    ])->assertOk();

    expect($this->getJson($filterUrl)->json('meta.total'))->toBe(0);
});

it('updates filtered GraphQL list when item leaves the filter', function (): void {
    ['collection' => $collection, 'slug' => $slug] = freshnessCollection('gql-filter');

    $item = $collection->items()->create([]);
    syncItemValues($item, $collection, ['title' => 'keep-me']);

    $query = <<<'GQL'
        query ($c: String!, $f: JSON) {
            items(collection: $c, filter: $f) { data { id data } meta { total } }
        }
        GQL;

    $warm = gql($query, ['c' => $slug, 'f' => ['title' => 'keep-me']]);
    expect($warm['items']['meta']['total'])->toBe(1);

    gql(<<<'GQL'
        mutation ($c: String!, $id: ID!, $d: JSON!) {
            updateItem(collection: $c, id: $id, data: $d) { id }
        }
        GQL, ['c' => $slug, 'id' => (string) $item->id, 'd' => ['title' => 'gone']]);

    $fresh = gql($query, ['c' => $slug, 'f' => ['title' => 'keep-me']]);
    expect($fresh['items']['meta']['total'])->toBe(0);
});

it('keeps locale and include_all_translations reads fresh after translation update', function (): void {
    app(SettingsRepository::class)->setMany(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        [
            'content_locales' => ['en', 'it'],
            'default_content_locale' => 'en',
            'fallback_content_locales' => ['en', 'it'],
        ],
    );

    $slug = 'locale-'.uniqid();
    $collection = Collection::query()->create([
        'name' => 'Locale Posts',
        'slug' => $slug,
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => true,
    ]);
    grantPublicActions($collection, [
        CollectionPermissionAction::Read,
        CollectionPermissionAction::Update,
    ]);

    $item = $collection->items()->create([]);
    syncItemValues($item, $collection, [
        'title' => ['en' => 'Hello', 'it' => 'Ciao'],
    ]);

    $itUrl = "/api/v1/collections/{$slug}/items/{$item->id}?locale=it";
    $allUrl = "/api/v1/collections/{$slug}/items/{$item->id}?include_all_translations=1";

    expect($this->getJson($itUrl)->json('data.data.title'))->toBe('Ciao');
    expect($this->getJson($allUrl)->json('data.data.title'))->toMatchArray([
        'en' => 'Hello',
        'it' => 'Ciao',
    ]);

    $this->patchJson("/api/v1/collections/{$slug}/items/{$item->id}", [
        'data' => ['title' => ['en' => 'Hello', 'it' => 'Salve']],
    ])->assertOk();

    expect($this->getJson($itUrl)->json('data.data.title'))->toBe('Salve');
    expect($this->getJson($allUrl)->json('data.data.title.it'))->toBe('Salve');

    $gqlResponse = $this->postJson('/api/graphql?locale=it', [
        'query' => 'query ($c: String!, $id: ID!) { item(collection: $c, id: $id) { data } }',
        'variables' => ['c' => $slug, 'id' => (string) $item->id],
    ]);
    $gqlResponse->assertOk();
    expect($gqlResponse->json('errors'))->toBeNull()
        ->and($gqlResponse->json('data.item.data.title'))->toBe('Salve');
});

it('eager-loads fieldValues so list query count does not scale 1:1 with items', function (): void {
    ['collection' => $collection, 'slug' => $slug] = freshnessCollection('qcount');

    foreach (['one', 'two', 'three', 'four', 'five'] as $title) {
        $item = $collection->items()->create([]);
        syncItemValues($item, $collection, ['title' => $title]);
    }

    // Warm permission/cache outside the measured window.
    $this->getJson("/api/v1/collections/{$slug}/items?per_page=5")->assertOk();

    // Force miss so remember callback runs (bump version).
    app(PublicApiResponseCache::class)->bump((int) $collection->id);

    DB::flushQueryLog();
    DB::enableQueryLog();
    $this->getJson("/api/v1/collections/{$slug}/items?per_page=5")->assertOk()->assertJsonPath('meta.total', 5);
    $queries = count(DB::getQueryLog());
    DB::disableQueryLog();

    // N+1 would be ~5 value queries alone; with eager-load, total stays well under 5*items.
    expect($queries)->toBeLessThan(25);
});

it('forces a cache miss after settings public API flush', function (): void {
    ['collection' => $collection, 'field' => $field, 'slug' => $slug] = freshnessCollection('flush');

    $item = $collection->items()->create([]);
    syncItemValues($item, $collection, ['title' => 'CachedA']);

    $url = "/api/v1/collections/{$slug}/items/{$item->id}";
    expect($this->getJson($url)->json('data.data.title'))->toBe('CachedA');

    // Bypass ValuesWriter so version does not bump — proves flush alone forces miss.
    $item->fieldValues()->where('field_id', $field->id)->update([
        'value' => json_encode('FlushedB'),
    ]);

    // Still stale A without flush
    expect($this->getJson($url)->json('data.data.title'))->toBe('CachedA');

    $admin = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);
    $this->actingAs($admin)
        ->post(route('performance.flush-public-api'))
        ->assertRedirect(route('performance.edit'));

    expect($this->getJson($url)->json('data.data.title'))->toBe('FlushedB');
});

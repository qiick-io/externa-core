<?php

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Services\Api\PublicApiResponseCache;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\DB;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

/**
 * @param  array<string, mixed>  $data
 */
function syncPrewarmItem(CollectionItem $item, Collection $collection, array $data): void
{
    $normalized = app(CollectionItemDataNormalizer::class)->normalize($collection, $data, $item->wasRecentlyCreated);
    app(CollectionItemValuesWriter::class)->sync($item, $collection, $normalized);
}

/**
 * @return array{slug: string, collection: Collection, authorIds: list<int>, tagIds: list<int>}
 */
function makePrewarmRelationGraph(int $parentCount): array
{
    $authors = Collection::query()->create([
        'name' => 'Authors',
        'slug' => 'prewarm-authors-'.$parentCount,
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
    syncPrewarmItem($authorA, $authors->fresh(['fields']), ['name' => 'Ada']);
    syncPrewarmItem($authorB, $authors->fresh(['fields']), ['name' => 'Grace']);

    $tags = Collection::query()->create([
        'name' => 'Tags',
        'slug' => 'prewarm-tags-'.$parentCount,
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $tags->id,
        'name' => 'label',
        'type' => FieldTypeEnum::String,
    ]);
    $tagA = $tags->items()->create([]);
    $tagB = $tags->items()->create([]);
    syncPrewarmItem($tagA, $tags->fresh(['fields']), ['label' => 'news']);
    syncPrewarmItem($tagB, $tags->fresh(['fields']), ['label' => 'ops']);

    $posts = Collection::query()->create([
        'name' => 'Posts',
        'slug' => 'prewarm-posts-'.$parentCount,
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $posts->id,
        'name' => 'author',
        'type' => FieldTypeEnum::ManyToOne,
        'settings' => ['related_collection_id' => $authors->id],
    ]);
    CollectionField::factory()->create([
        'collection_id' => $posts->id,
        'name' => 'categories',
        'type' => FieldTypeEnum::ManyToMany,
        'settings' => ['related_collection_id' => $tags->id],
    ]);

    $posts = $posts->fresh(['fields']);
    $authorIds = [$authorA->id, $authorB->id];
    $tagIds = [$tagA->id, $tagB->id];

    for ($i = 0; $i < $parentCount; $i++) {
        $post = $posts->items()->create([]);
        syncPrewarmItem($post, $posts, [
            'author' => $authorIds[$i % 2],
            'categories' => [
                ['related_item_id' => $tagIds[$i % 2], 'meta' => ['sort' => $i]],
                ['related_item_id' => $tagIds[($i + 1) % 2], 'meta' => ['sort' => $i + 1]],
            ],
        ]);
    }

    grantPublicActions($posts, [CollectionPermissionActionEnum::Read]);
    grantPublicActions($authors, [CollectionPermissionActionEnum::Read]);
    grantPublicActions($tags, [CollectionPermissionActionEnum::Read]);

    return [
        'slug' => $posts->slug,
        'collection' => $posts,
        'authorIds' => $authorIds,
        'tagIds' => $tagIds,
    ];
}

/**
 * Count list queries excluding `settings` lookups (covered by #117 memoization).
 *
 * @return array{total: int, relation_where_in: int, without_settings: int}
 */
function measurePrewarmListQueries(object $test, string $slug, int $perPage): array
{
    $url = "/api/v1/collections/{$slug}/items?per_page={$perPage}&include=author,categories,files,users";

    // Warm auth / permission caches outside the measured window.
    $test->getJson($url)->assertOk();
    app(PublicApiResponseCache::class)->bump(
        (int) Collection::query()->where('slug', $slug)->value('id')
    );

    DB::flushQueryLog();
    DB::enableQueryLog();
    $response = $test->getJson($url)->assertOk();
    $log = DB::getQueryLog();
    DB::disableQueryLog();

    $withoutSettings = 0;
    $relationWhereIn = 0;
    foreach ($log as $row) {
        $sql = $row['query'];
        if (str_contains($sql, 'from "settings"') || str_contains($sql, 'from `settings`')) {
            continue;
        }
        $withoutSettings++;
        if (
            str_contains($sql, 'from "collections_items"')
            && str_contains($sql, '"id" in (')
        ) {
            $relationWhereIn++;
        }
    }

    expect($response->json('meta.total'))->toBe($perPage)
        ->and($response->json('data.0.data.author.data.name'))->not->toBeEmpty()
        ->and($response->json('data.0.data.categories.0.item.data.label'))->not->toBeEmpty();

    return [
        'total' => count($log),
        'relation_where_in' => $relationWhereIn,
        'without_settings' => $withoutSettings,
    ];
}

it('keeps list include query count constant as parent N grows (shared related ids)', function (): void {
    $five = makePrewarmRelationGraph(5);
    $q5 = measurePrewarmListQueries($this, $five['slug'], 5);

    $twentyFive = makePrewarmRelationGraph(25);
    $q25 = measurePrewarmListQueries($this, $twentyFive['slug'], 25);

    // Depth-1 relation prewarm: related whereIn stays O(related collections), not O(parents).
    expect($q5['relation_where_in'])->toBe(2)
        ->and($q25['relation_where_in'])->toBe(2)
        ->and($q25['without_settings'])->toBeLessThanOrEqual($q5['without_settings'] + 3)
        ->and($q5['without_settings'])->toBeLessThan(40)
        ->and($q25['without_settings'])->toBeLessThan(40);
});

it('still expands relations on a multi-item list with shared related ids', function (): void {
    $graph = makePrewarmRelationGraph(3);
    $response = $this->getJson(
        "/api/v1/collections/{$graph['slug']}/items?per_page=3&include=author,categories"
    )->assertOk();

    expect($response->json('meta.total'))->toBe(3);

    foreach ($response->json('data') as $row) {
        expect($row['data']['author'])->toBeArray()
            ->and($row['data']['author']['id'])->toBeIn($graph['authorIds'])
            ->and($row['data']['author']['data']['name'])->toBeIn(['Ada', 'Grace'])
            ->and($row['data']['categories'])->toHaveCount(2)
            ->and($row['data']['categories'][0]['item']['id'])->toBeIn($graph['tagIds'])
            ->and($row['data']['categories'][0]['meta'])->toHaveKey('sort');
    }
});

it('leaves single-item include path correct after list prewarm exists', function (): void {
    $graph = makePrewarmRelationGraph(2);
    $list = $this->getJson(
        "/api/v1/collections/{$graph['slug']}/items?per_page=2&include=author,categories"
    )->assertOk();
    $itemId = (int) $list->json('data.0.id');

    $show = $this->getJson(
        "/api/v1/collections/{$graph['slug']}/items/{$itemId}?include=author,categories"
    )->assertOk();

    expect($show->json('data.data.author.id'))->toBeIn($graph['authorIds'])
        ->and($show->json('data.data.categories.0.item.id'))->toBeIn($graph['tagIds']);
});

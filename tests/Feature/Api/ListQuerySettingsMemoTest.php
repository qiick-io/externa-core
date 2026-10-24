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
function syncListAuditItem(CollectionItem $item, Collection $collection, array $data): void
{
    $normalized = app(CollectionItemDataNormalizer::class)->normalize($collection, $data, $item->wasRecentlyCreated);
    app(CollectionItemValuesWriter::class)->sync($item, $collection, $normalized);
}

function makeListAuditCollection(int $n): string
{
    $collection = Collection::query()->create([
        'name' => 'ListAudit',
        'slug' => 'list-audit-'.$n.'-'.uniqid(),
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $collection = $collection->fresh(['fields']);
    for ($i = 0; $i < $n; $i++) {
        $item = $collection->items()->create([]);
        syncListAuditItem($item, $collection, ['title' => "Item {$i}"]);
    }
    grantPublicActions($collection, [CollectionPermissionActionEnum::Read]);

    return $collection->slug;
}

function countSettingsQueries(object $test, string $slug, int $perPage): int
{
    $url = "/api/v1/collections/{$slug}/items?per_page={$perPage}";
    $test->getJson($url)->assertOk();
    app(PublicApiResponseCache::class)->bump(
        (int) Collection::query()->where('slug', $slug)->value('id')
    );

    DB::flushQueryLog();
    DB::enableQueryLog();
    $test->getJson($url)->assertOk()->assertJsonPath('meta.total', $perPage);
    $log = DB::getQueryLog();
    DB::disableQueryLog();

    $settings = 0;
    foreach ($log as $row) {
        if (str_contains($row['query'], 'from "settings"') || str_contains($row['query'], 'from `settings`')) {
            $settings++;
        }
    }

    return $settings;
}

it('does not re-query project settings once per parent on public item lists', function (): void {
    $slug5 = makeListAuditCollection(5);
    $s5 = countSettingsQueries($this, $slug5, 5);

    $slug25 = makeListAuditCollection(25);
    $s25 = countSettingsQueries($this, $slug25, 25);

    // Before memoization this scaled ~2×N; after it stays a small constant.
    expect($s5)->toBeLessThanOrEqual(4)
        ->and($s25)->toBeLessThanOrEqual(4)
        ->and($s25)->toBeLessThanOrEqual($s5 + 1);
});

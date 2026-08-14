<?php

use App\Models\Collection;
use App\Models\CollectionItemRevision;
use App\Models\User;
use App\Services\Collections\CollectionItemRevisionPruner;
use App\Services\Settings\SettingsRepository;
use Database\Seeders\PermissionSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

/**
 * @param  list<string>  $createdAts
 * @return list<CollectionItemRevision>
 */
function seedRevisionsForItem(int $itemId, ?int $userId, array $createdAts): array
{
    $revisions = [];

    foreach ($createdAts as $i => $createdAt) {
        $revisions[] = CollectionItemRevision::query()->create([
            'item_id' => $itemId,
            'user_id' => $userId,
            'data' => ['title' => "r{$i}"],
            'meta' => null,
            'created_at' => $createdAt,
        ]);
    }

    return $revisions;
}

test('count retention keeps only the newest N revisions', function () {
    $user = User::factory()->create();
    $n = 3;

    $collection = Collection::factory()->create([
        'revision_retention_count' => $n,
        'revision_retention_days' => null,
    ]);
    $item = $collection->items()->create([]);

    $revisions = seedRevisionsForItem($item->id, $user->id, [
        now()->subDays(5)->toDateTimeString(),
        now()->subDays(4)->toDateTimeString(),
        now()->subDays(3)->toDateTimeString(),
        now()->subDays(2)->toDateTimeString(),
        now()->subDay()->toDateTimeString(),
    ]);

    expect(count($revisions))->toBe($n + 2);

    $deleted = app(CollectionItemRevisionPruner::class)->pruneItem($item);

    expect($deleted)->toBe(2);

    $remaining = CollectionItemRevision::query()
        ->where('item_id', $item->id)
        ->orderByDesc('created_at')
        ->orderByDesc('id')
        ->get();

    expect($remaining)->toHaveCount($n);
    expect($remaining->pluck('id')->all())->toBe([
        $revisions[4]->id,
        $revisions[3]->id,
        $revisions[2]->id,
    ]);
});

test('days retention deletes old revisions and keeps recent ones', function () {
    $user = User::factory()->create();

    $collection = Collection::factory()->create([
        'revision_retention_count' => null,
        'revision_retention_days' => 7,
    ]);
    $item = $collection->items()->create([]);

    [$oldA, $oldB, $recentA, $recentB] = seedRevisionsForItem($item->id, $user->id, [
        now()->subDays(30)->toDateTimeString(),
        now()->subDays(10)->toDateTimeString(),
        now()->subDays(3)->toDateTimeString(),
        now()->subDay()->toDateTimeString(),
    ]);

    $deleted = app(CollectionItemRevisionPruner::class)->pruneItem($item);

    expect($deleted)->toBe(2);

    $remainingIds = CollectionItemRevision::query()
        ->where('item_id', $item->id)
        ->pluck('id')
        ->all();

    expect($remainingIds)->toEqualCanonicalizing([$recentA->id, $recentB->id]);
    expect($remainingIds)->not->toContain($oldA->id);
    expect($remainingIds)->not->toContain($oldB->id);
});

test('both limits apply age first then keep newest N', function () {
    $user = User::factory()->create();

    $collection = Collection::factory()->create([
        'revision_retention_count' => 2,
        'revision_retention_days' => 7,
    ]);
    $item = $collection->items()->create([]);

    // Age prune drops the two oldest; count prune then keeps newest 2 of the rest.
    [$tooOldA, $tooOldB, $withinDaysOldest, $keepMid, $keepNewest] = seedRevisionsForItem($item->id, $user->id, [
        now()->subDays(20)->toDateTimeString(),
        now()->subDays(10)->toDateTimeString(),
        now()->subDays(5)->toDateTimeString(),
        now()->subDays(2)->toDateTimeString(),
        now()->subDay()->toDateTimeString(),
    ]);

    $deleted = app(CollectionItemRevisionPruner::class)->pruneItem($item);

    expect($deleted)->toBe(3);

    $remainingIds = CollectionItemRevision::query()
        ->where('item_id', $item->id)
        ->orderByDesc('created_at')
        ->pluck('id')
        ->all();

    expect($remainingIds)->toBe([$keepNewest->id, $keepMid->id]);
    expect($remainingIds)->not->toContain($tooOldA->id);
    expect($remainingIds)->not->toContain($tooOldB->id);
    expect($remainingIds)->not->toContain($withinDaysOldest->id);
});

test('null retention limits delete nothing', function () {
    $user = User::factory()->create();

    $collection = Collection::factory()->create([
        'revision_retention_count' => null,
        'revision_retention_days' => null,
    ]);
    $item = $collection->items()->create([]);

    seedRevisionsForItem($item->id, $user->id, [
        now()->subDays(100)->toDateTimeString(),
        now()->subDays(50)->toDateTimeString(),
        now()->subDay()->toDateTimeString(),
    ]);

    $deleted = app(CollectionItemRevisionPruner::class)->pruneItem($item);

    expect($deleted)->toBe(0);
    expect(CollectionItemRevision::query()->where('item_id', $item->id)->count())->toBe(3);
});

test('collection retention override wins over project defaults', function () {
    $user = User::factory()->create();

    app(SettingsRepository::class)->setMany(SettingsRepository::SCOPE_PROJECT, 'project', [
        'revision_retention_count' => 2,
        'revision_retention_days' => null,
    ]);

    $collection = Collection::factory()->create([
        'revision_retention_count' => 4,
        'revision_retention_days' => null,
    ]);
    $item = $collection->items()->create([]);

    $revisions = seedRevisionsForItem($item->id, $user->id, [
        now()->subDays(5)->toDateTimeString(),
        now()->subDays(4)->toDateTimeString(),
        now()->subDays(3)->toDateTimeString(),
        now()->subDays(2)->toDateTimeString(),
        now()->subDay()->toDateTimeString(),
    ]);

    $deleted = app(CollectionItemRevisionPruner::class)->pruneItem($item);

    expect($deleted)->toBe(1);
    expect(CollectionItemRevision::query()->where('item_id', $item->id)->count())->toBe(4);
    expect(
        CollectionItemRevision::query()
            ->where('item_id', $item->id)
            ->orderByDesc('created_at')
            ->pluck('id')
            ->all(),
    )->toBe([
        $revisions[4]->id,
        $revisions[3]->id,
        $revisions[2]->id,
        $revisions[1]->id,
    ]);
});

test('project default applies when collection retention is null', function () {
    $user = User::factory()->create();

    app(SettingsRepository::class)->setMany(SettingsRepository::SCOPE_PROJECT, 'project', [
        'revision_retention_count' => 2,
        'revision_retention_days' => null,
    ]);

    $collection = Collection::factory()->create([
        'revision_retention_count' => null,
        'revision_retention_days' => null,
    ]);
    $item = $collection->items()->create([]);

    $revisions = seedRevisionsForItem($item->id, $user->id, [
        now()->subDays(4)->toDateTimeString(),
        now()->subDays(3)->toDateTimeString(),
        now()->subDays(2)->toDateTimeString(),
        now()->subDay()->toDateTimeString(),
    ]);

    $deleted = app(CollectionItemRevisionPruner::class)->pruneItem($item);

    expect($deleted)->toBe(2);
    expect(
        CollectionItemRevision::query()
            ->where('item_id', $item->id)
            ->orderByDesc('created_at')
            ->pluck('id')
            ->all(),
    )->toBe([$revisions[3]->id, $revisions[2]->id]);
});

test('both collection and project null means no prune', function () {
    $user = User::factory()->create();

    app(SettingsRepository::class)->setMany(SettingsRepository::SCOPE_PROJECT, 'project', [
        'revision_retention_count' => null,
        'revision_retention_days' => null,
    ]);

    $collection = Collection::factory()->create([
        'revision_retention_count' => null,
        'revision_retention_days' => null,
    ]);
    $item = $collection->items()->create([]);

    seedRevisionsForItem($item->id, $user->id, [
        now()->subDays(100)->toDateTimeString(),
        now()->subDays(50)->toDateTimeString(),
        now()->subDay()->toDateTimeString(),
    ]);

    $deleted = app(CollectionItemRevisionPruner::class)->pruneItem($item);

    expect($deleted)->toBe(0);
    expect(CollectionItemRevision::query()->where('item_id', $item->id)->count())->toBe(3);
});

test('collections:prune-revisions artisan command prunes limited collections', function () {
    $user = User::factory()->create();

    $limited = Collection::factory()->create([
        'revision_retention_count' => 2,
        'revision_retention_days' => null,
    ]);
    $unlimited = Collection::factory()->create([
        'revision_retention_count' => null,
        'revision_retention_days' => null,
    ]);

    $limitedItem = $limited->items()->create([]);
    $unlimitedItem = $unlimited->items()->create([]);

    seedRevisionsForItem($limitedItem->id, $user->id, [
        now()->subDays(3)->toDateTimeString(),
        now()->subDays(2)->toDateTimeString(),
        now()->subDay()->toDateTimeString(),
        now()->toDateTimeString(),
    ]);
    seedRevisionsForItem($unlimitedItem->id, $user->id, [
        now()->subDays(3)->toDateTimeString(),
        now()->subDays(2)->toDateTimeString(),
        now()->subDay()->toDateTimeString(),
        now()->toDateTimeString(),
    ]);

    $this->artisan('collections:prune-revisions')
        ->expectsOutputToContain('Pruned 2 collection item revision(s).')
        ->assertSuccessful();

    expect(CollectionItemRevision::query()->where('item_id', $limitedItem->id)->count())->toBe(2);
    expect(CollectionItemRevision::query()->where('item_id', $unlimitedItem->id)->count())->toBe(4);
});

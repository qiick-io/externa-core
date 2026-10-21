<?php

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemRevision;
use App\Models\User;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Artisan;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

/**
 * Simulate a pre-fix rename: update field name directly (activity log records
 * old→new) without rewriting draft_data / revision keys.
 *
 * @return array{0: Collection, 1: CollectionField, 2: CollectionItem, 3: CollectionItemRevision}
 */
function brokenRenameFixture(string $keep = 'KEEP ME'): array
{
    $user = grantCollectionPermissions(User::factory()->create());
    test()->actingAs($user);

    $collection = Collection::factory()->create([
        'versioning' => true,
        'slug' => 'posts-'.uniqid(),
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $summary = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'summary',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([]);
    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer->sync($item, $collection, $normalizer->normalize($collection, [
        'title' => 'Live',
        'summary' => $keep,
    ], true));

    $item->draft_data = [
        'title' => 'Draft title',
        'summary' => $keep,
    ];
    $item->save();

    $revision = CollectionItemRevision::query()->create([
        'item_id' => $item->id,
        'user_id' => $user->id,
        'data' => [
            'title' => 'v1',
            'summary' => $keep,
        ],
        'meta' => ['source' => 'sync'],
        'created_at' => now(),
    ]);

    // Pre-fix path: rename without CollectionFieldRenamer.
    $summary->update(['name' => 'excerpt']);

    return [$collection, $summary->fresh(), $item->fresh(), $revision];
}

it('registers externa:repair-renamed-field-drafts', function () {
    expect(Artisan::all())->toHaveKey('externa:repair-renamed-field-drafts');
});

test('dry-run lists remaps from activity-log rename history without writing', function () {
    [$collection, $field, $item, $revision] = brokenRenameFixture();

    expect(Artisan::call('externa:repair-renamed-field-drafts'))->toBe(0);
    $output = Artisan::output();

    expect($output)->toContain('[dry-run]')
        ->and($output)->toContain((string) $collection->slug)
        ->and($output)->toContain('summary')
        ->and($output)->toContain('excerpt')
        ->and($output)->toContain('KEEP ME');

    $item->refresh();
    $revision->refresh();
    expect($item->draft_data)->toHaveKey('summary')
        ->and($item->draft_data)->not->toHaveKey('excerpt')
        ->and($revision->data)->toHaveKey('summary')
        ->and($revision->data)->not->toHaveKey('excerpt');
});

test('apply remaps draft_data and revisions using rename history', function () {
    [$collection, $field, $item, $revision] = brokenRenameFixture();

    expect(Artisan::call('externa:repair-renamed-field-drafts', ['--apply' => true]))->toBe(0);
    expect(Artisan::output())->toContain('[apply]');

    $item->refresh();
    $revision->refresh();
    expect($item->draft_data['excerpt'] ?? null)->toBe('KEEP ME')
        ->and($item->draft_data)->not->toHaveKey('summary')
        ->and($item->draft_data['title'] ?? null)->toBe('Draft title')
        ->and($revision->data['excerpt'] ?? null)->toBe('KEEP ME')
        ->and($revision->data)->not->toHaveKey('summary');

    // Published value was always field_id-safe; still present under new name.
    expect(app(CollectionItemValuesAssembler::class)->assemble($item)['excerpt'] ?? null)->toBe('KEEP ME');
});

test('conflict skips remap when the new key already has a value', function () {
    [$collection, $field, $item, $revision] = brokenRenameFixture('OLD');

    $item->draft_data = [
        'title' => 'Draft title',
        'summary' => 'OLD',
        'excerpt' => 'ALREADY',
    ];
    $item->save();

    $revision->data = [
        'title' => 'v1',
        'summary' => 'OLD',
        'excerpt' => 'ALREADY',
    ];
    $revision->save();

    expect(Artisan::call('externa:repair-renamed-field-drafts', ['--apply' => true]))->toBe(0);
    $output = Artisan::output();
    expect($output)->toContain('Conflicts (new key already set')
        ->and($output)->toContain('conflict=');

    $item->refresh();
    $revision->refresh();
    expect($item->draft_data['excerpt'] ?? null)->toBe('ALREADY')
        ->and($item->draft_data)->toHaveKey('summary')
        ->and($item->draft_data['summary'] ?? null)->toBe('OLD')
        ->and($revision->data['excerpt'] ?? null)->toBe('ALREADY')
        ->and($revision->data)->toHaveKey('summary');
});

test('unmappable orphan keys are reported and left untouched', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['versioning' => true, 'slug' => 'orphan-'.uniqid()]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = $collection->items()->create([
        'draft_data' => [
            'title' => 'T',
            'ghost' => 'NO MAP',
        ],
    ]);

    expect(Artisan::call('externa:repair-renamed-field-drafts', ['--apply' => true]))->toBe(0);
    $output = Artisan::output();
    expect($output)->toContain('Unmappable orphan keys')
        ->and($output)->toContain('ghost');

    $item->refresh();
    expect($item->draft_data['ghost'] ?? null)->toBe('NO MAP')
        ->and($item->draft_data['title'] ?? null)->toBe('T');
});

test('explicit --map remaps when activity history is absent', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['versioning' => true, 'slug' => 'manual-'.uniqid()]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'excerpt',
        'type' => FieldTypeEnum::String,
    ]);
    $item = $collection->items()->create([
        'draft_data' => [
            'title' => 'T',
            'summary' => 'KEEP ME',
        ],
    ]);

    // No field update → no activity rename history for summary→excerpt.
    expect(Artisan::call('externa:repair-renamed-field-drafts', [
        '--apply' => true,
        '--map' => ["{$collection->slug}:summary=excerpt"],
    ]))->toBe(0);

    $item->refresh();
    expect($item->draft_data['excerpt'] ?? null)->toBe('KEEP ME')
        ->and($item->draft_data)->not->toHaveKey('summary');
});

test('apply is idempotent and covers soft-deleted items', function () {
    [$collection, $field, $item, $revision] = brokenRenameFixture();
    $item->delete();
    expect($item->fresh()->trashed())->toBeTrue();

    expect(Artisan::call('externa:repair-renamed-field-drafts', ['--apply' => true]))->toBe(0);

    $item = CollectionItem::withTrashed()->findOrFail($item->id);
    expect($item->draft_data['excerpt'] ?? null)->toBe('KEEP ME')
        ->and($item->draft_data)->not->toHaveKey('summary');

    expect(Artisan::call('externa:repair-renamed-field-drafts', ['--apply' => true]))->toBe(0);
    expect(Artisan::output())->toContain('remapped=0');

    $item->refresh();
    expect($item->draft_data['excerpt'] ?? null)->toBe('KEEP ME')
        ->and($item->draft_data)->not->toHaveKey('summary');
});

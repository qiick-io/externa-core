<?php

use App\Ai\Tools\ManageCollections;
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
use Laravel\Ai\Tools\Request;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

/**
 * @return array{0: Collection, 1: CollectionField, 2: CollectionField, 3: CollectionItem}
 */
function renamePreservesValuesFixture(bool $translatableSummary = false): array
{
    $collection = Collection::factory()->create(['versioning' => true]);
    $title = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $summary = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'summary',
        'type' => FieldTypeEnum::String,
        'translatable' => $translatableSummary,
    ]);
    $item = $collection->items()->create([]);

    return [$collection, $title, $summary, $item];
}

function renameFieldViaAdmin(Collection $collection, CollectionField $field, string $newName): void
{
    test()->patch(route('collections.fields.update', [$collection, $field]), [
        'name' => $newName,
        'type' => $field->type->value,
        'translatable' => $field->translatable,
        'settings' => is_array($field->settings) ? $field->settings : ['required' => '0'],
    ])->assertRedirect()->assertSessionHasNoErrors();
}

test('rename without a draft keeps the published value under the new name', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    [$collection, $title, $summary, $item] = renamePreservesValuesFixture();
    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer->sync($item, $collection, $normalizer->normalize($collection, [
        'title' => 'Live title',
        'summary' => 'KEEP ME',
    ], true));

    renameFieldViaAdmin($collection, $summary, 'excerpt');

    $summary->refresh();
    expect($summary->name)->toBe('excerpt');

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item->fresh());
    expect($assembled['excerpt'] ?? null)->toBe('KEEP ME')
        ->and($assembled)->not->toHaveKey('summary');
});

test('rename with pending draft then manual publish keeps the value under the new name', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    [$collection, $title, $summary, $item] = renamePreservesValuesFixture(translatableSummary: true);
    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer->sync($item, $collection, $normalizer->normalize($collection, [
        'title' => 'Live title',
        'summary' => ['en' => 'KEEP ME', 'it' => 'CONSERVA'],
    ], true));

    $this->put(route('collections.items.update', [$collection, $item]), [
        'version' => 'draft',
        'data' => [
            'title' => 'T2',
            'summary' => ['en' => 'KEEP ME', 'it' => 'CONSERVA'],
        ],
    ])->assertRedirect();

    $item->refresh();
    expect($item->draft_data['summary']['en'] ?? null)->toBe('KEEP ME');

    renameFieldViaAdmin($collection, $summary, 'excerpt');

    $item->refresh();
    expect($item->draft_data['excerpt']['en'] ?? null)->toBe('KEEP ME')
        ->and($item->draft_data['excerpt']['it'] ?? null)->toBe('CONSERVA')
        ->and($item->draft_data)->not->toHaveKey('summary');

    $this->post(route('collections.items.publish', [$collection, $item]))
        ->assertRedirect();

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item->fresh());
    expect($assembled['title'] ?? null)->toBe('T2')
        ->and($assembled['excerpt']['en'] ?? null)->toBe('KEEP ME')
        ->and($assembled['excerpt']['it'] ?? null)->toBe('CONSERVA')
        ->and($assembled)->not->toHaveKey('summary');
});

test('rename with pending draft then scheduled publish keeps the value under the new name', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    [$collection, $title, $summary, $item] = renamePreservesValuesFixture();
    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer->sync($item, $collection, $normalizer->normalize($collection, [
        'title' => 'Live title',
        'summary' => 'KEEP ME',
    ], true));

    $this->put(route('collections.items.update', [$collection, $item]), [
        'version' => 'draft',
        'data' => [
            'title' => 'Scheduled title',
            'summary' => 'KEEP ME',
        ],
    ])->assertRedirect();

    $item->refresh();
    $item->publish_at = now()->addHour();
    $item->save();

    renameFieldViaAdmin($collection, $summary, 'excerpt');

    $this->travelTo(now()->addHours(2));
    $this->artisan('collections:process-schedules')->assertSuccessful();

    $item->refresh();
    expect($item->draft_data)->toBeNull();

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item);
    expect($assembled['title'] ?? null)->toBe('Scheduled title')
        ->and($assembled['excerpt'] ?? null)->toBe('KEEP ME');
});

test('rename via AI update_field then publish keeps the value and rewrites layout group pointers', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    [$collection, $title, $summary, $item] = renamePreservesValuesFixture();
    $group = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'details',
        'type' => FieldTypeEnum::GroupDetail,
        'settings' => ['layout_width' => 'full'],
    ]);
    $child = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'body',
        'type' => FieldTypeEnum::String,
        'settings' => ['group' => 'details', 'required' => '0'],
    ]);

    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer->sync($item, $collection, $normalizer->normalize($collection, [
        'title' => 'Live title',
        'summary' => 'KEEP ME',
        'body' => 'Child value',
    ], true));

    $this->put(route('collections.items.update', [$collection, $item]), [
        'version' => 'draft',
        'data' => [
            'title' => 'AI draft',
            'summary' => 'KEEP ME',
            'body' => 'Child value',
        ],
    ])->assertRedirect();

    $tool = new ManageCollections;
    $summaryRename = (string) $tool->handle(new Request([
        'action' => 'update_field',
        'collection_id' => $collection->id,
        'field_id' => $summary->id,
        'name' => 'excerpt',
    ]));
    expect($summaryRename)->not->toContain('Error:')
        ->and(json_decode($summaryRename, true)['field']['name'] ?? null)->toBe('excerpt');

    $groupRename = (string) $tool->handle(new Request([
        'action' => 'update_field',
        'collection_id' => $collection->id,
        'field_id' => $group->id,
        'name' => 'meta',
    ]));
    expect($groupRename)->not->toContain('Error:');
    expect($child->fresh()->settings['group'] ?? null)->toBe('meta');

    $item->refresh();
    expect($item->draft_data['excerpt'] ?? null)->toBe('KEEP ME')
        ->and($item->draft_data)->not->toHaveKey('summary');

    $this->post(route('collections.items.publish', [$collection, $item]))
        ->assertRedirect();

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item->fresh());
    expect($assembled['title'] ?? null)->toBe('AI draft')
        ->and($assembled['excerpt'] ?? null)->toBe('KEEP ME')
        ->and($assembled['body'] ?? null)->toBe('Child value');
});

test('restore of a pre-rename revision keeps the value under the new name', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    [$collection, $title, $summary, $item] = renamePreservesValuesFixture();
    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer->sync($item, $collection, $normalizer->normalize($collection, [
        'title' => 'v1',
        'summary' => 'KEEP ME',
    ], true));
    $writer->sync($item->fresh(), $collection, $normalizer->normalize($collection, [
        'title' => 'v2',
        'summary' => 'KEEP ME',
    ], false));

    $first = CollectionItemRevision::query()
        ->where('item_id', $item->id)
        ->orderBy('id')
        ->firstOrFail();
    expect($first->data)->toHaveKey('summary');

    renameFieldViaAdmin($collection, $summary, 'excerpt');

    $first->refresh();
    expect($first->data['excerpt'] ?? null)->toBe('KEEP ME')
        ->and($first->data)->not->toHaveKey('summary');

    $this->post(route('collections.items.revisions.restore', [$collection, $item, $first]))
        ->assertRedirect();

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item->fresh());
    expect($assembled['title'] ?? null)->toBe('v1')
        ->and($assembled['excerpt'] ?? null)->toBe('KEEP ME');
});

test('kanban move after rename then publish keeps the renamed field value', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'is_singleton' => false,
        'versioning' => true,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'type' => FieldTypeEnum::Select,
        'settings' => [
            'options' => [
                ['value' => 'draft', 'label' => 'Draft'],
                ['value' => 'published', 'label' => 'Published'],
            ],
        ],
    ]);
    $summary = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'summary',
        'type' => FieldTypeEnum::String,
    ]);
    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
    ]);

    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer->sync($item, $collection, $normalizer->normalize($collection, [
        'status' => 'published',
        'summary' => 'KEEP ME',
    ], true));

    $this->put(route('collections.items.update', [$collection, $item]), [
        'version' => 'draft',
        'data' => [
            'status' => 'published',
            'summary' => 'KEEP ME',
        ],
    ])->assertRedirect();

    renameFieldViaAdmin($collection, $summary, 'excerpt');

    $this->put(route('collections.items.update', [$collection, $item]), [
        'data' => ['status' => 'draft'],
        'board_move' => true,
        'save_action' => 'stay',
        'return' => route('collections.items.index', $collection, false),
    ])->assertRedirect();

    $item->refresh();
    expect($item->draft_data['excerpt'] ?? null)->toBe('KEEP ME')
        ->and($item->draft_data['status'] ?? null)->toBe('draft')
        ->and($item->draft_data)->not->toHaveKey('summary');

    $this->post(route('collections.items.publish', [$collection, $item]))
        ->assertRedirect();

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item->fresh());
    expect($assembled['status'] ?? null)->toBe('draft')
        ->and($assembled['excerpt'] ?? null)->toBe('KEEP ME');
});

test('calendar move after rename then publish keeps the renamed field value', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'is_singleton' => false,
        'versioning' => true,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'published_at',
        'type' => FieldTypeEnum::Date,
        'settings' => ['date_mode' => 'datetime'],
    ]);
    $summary = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'summary',
        'type' => FieldTypeEnum::String,
    ]);
    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
    ]);

    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer->sync($item, $collection, $normalizer->normalize($collection, [
        'published_at' => '2026-10-11T14:30',
        'summary' => 'KEEP ME',
    ], true));

    $this->put(route('collections.items.update', [$collection, $item]), [
        'version' => 'draft',
        'data' => [
            'published_at' => '2026-10-11T14:30',
            'summary' => 'KEEP ME',
        ],
    ])->assertRedirect();

    renameFieldViaAdmin($collection, $summary, 'excerpt');

    $this->put(route('collections.items.update', [$collection, $item]), [
        'data' => ['published_at' => '2026-10-20'],
        'calendar_move' => true,
        'save_action' => 'stay',
        'return' => route('collections.items.index', $collection, false),
    ])->assertRedirect();

    $item->refresh();
    expect($item->draft_data['excerpt'] ?? null)->toBe('KEEP ME')
        ->and($item->draft_data['published_at'] ?? null)->toBe('2026-10-20T14:30')
        ->and($item->draft_data)->not->toHaveKey('summary');

    $this->post(route('collections.items.publish', [$collection, $item]))
        ->assertRedirect();

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item->fresh());
    expect($assembled['published_at'] ?? null)->toBe('2026-10-20T14:30')
        ->and($assembled['excerpt'] ?? null)->toBe('KEEP ME');
});

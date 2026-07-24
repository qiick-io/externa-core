<?php

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItemRevision;
use App\Models\User;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use Database\Seeders\PermissionSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('item sync records a revision and restore rewrites data', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([]);
    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);

    $writer->sync($item, $collection, $normalizer->normalize($collection, ['title' => 'v1'], true));
    $writer->sync($item, $collection, $normalizer->normalize($collection, ['title' => 'v2'], false));

    expect(CollectionItemRevision::query()->where('item_id', $item->id)->count())->toBeGreaterThanOrEqual(2);

    $first = CollectionItemRevision::query()->where('item_id', $item->id)->orderBy('id')->firstOrFail();

    $this->get(route('collections.items.revisions.index', [$collection, $item]))
        ->assertOk();

    $this->post(route('collections.items.revisions.restore', [$collection, $item, $first]))
        ->assertRedirect();

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item->fresh());
    expect($assembled['title'])->toBe('v1');
});

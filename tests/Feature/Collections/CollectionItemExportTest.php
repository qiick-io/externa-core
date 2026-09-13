<?php

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\User;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use Database\Seeders\PermissionSeeder;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('items export downloads filtered csv and json', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::query()->create([
        'name' => 'Exportables',
        'slug' => 'exportables',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'type' => FieldTypeEnum::String,
    ]);

    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);

    $published = $collection->items()->create([]);
    $writer->sync($published, $collection, $normalizer->normalize($collection, [
        'title' => 'Public',
        'status' => 'published',
    ], true));

    $draft = $collection->items()->create([]);
    $writer->sync($draft, $collection, $normalizer->normalize($collection, [
        'title' => 'Secret',
        'status' => 'draft',
    ], true));

    $csv = $this->get(route('collections.items.export', [
        'collection' => $collection->id,
        'format' => 'csv',
        'filter' => ['status' => ['_eq' => 'published']],
    ]));
    $csv->assertOk();
    expect($csv->headers->get('content-disposition'))->toContain('exportables-items.csv');
    $body = $csv->streamedContent();
    expect($body)->toContain('Public')
        ->and($body)->not->toContain('Secret')
        ->and($csv->headers->get('X-Export-Rows'))->toBe('1');

    $json = $this->get(route('collections.items.export', [
        'collection' => $collection->id,
        'format' => 'json',
        'filter' => ['status' => ['_eq' => 'published']],
    ]));
    $json->assertOk();
    $decoded = json_decode($json->streamedContent(), true);
    expect($decoded)->toHaveCount(1)
        ->and($decoded[0]['title'] ?? null)->toBe('Public');
});

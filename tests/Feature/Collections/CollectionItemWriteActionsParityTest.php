<?php

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

/**
 * @return array{0: Collection, 1: CollectionItem}
 */
function makeVersionedWriteCollection(string $slug = 'parity-posts'): array
{
    $collection = Collection::query()->create([
        'name' => 'Parity Posts',
        'slug' => $slug,
        'is_singleton' => false,
        'sort_order' => 1,
        'versioning' => true,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'settings' => ['required' => true],
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'body',
        'type' => FieldTypeEnum::String,
    ]);

    grantPublicActions($collection, [
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Create,
        CollectionPermissionActionEnum::Update,
    ]);

    $item = $collection->items()->create([]);
    $normalized = app(CollectionItemDataNormalizer::class)->normalize($collection, [
        'title' => 'Published title',
        'body' => 'Published body',
    ], true);
    app(CollectionItemValuesWriter::class)->sync($item, $collection, $normalized);

    return [$collection->fresh(), $item->fresh()];
}

it('rejects unknown keys on REST create like the shared Action validator', function (): void {
    [$collection] = makeVersionedWriteCollection('parity-unknown');

    $this->postJson("/api/v1/collections/{$collection->slug}/items", [
        'data' => [
            'title' => 'Ok',
            'not_a_field' => 'nope',
        ],
    ])->assertUnprocessable();
});

it('rejects missing required fields on GraphQL createItem', function (): void {
    [$collection] = makeVersionedWriteCollection('parity-required');

    $response = $this->postJson('/api/graphql', [
        'query' => 'mutation ($c: String!, $d: JSON!) { createItem(collection: $c, data: $d) { id } }',
        'variables' => [
            'c' => $collection->slug,
            'd' => ['body' => 'no title'],
        ],
    ]);

    expect($response->status())->toBeIn([200, 422]);
    if ($response->status() === 200) {
        expect($response->json('errors'))->not->toBeEmpty();
    }
});

it('writes draft_data on versioned REST updates instead of published values', function (): void {
    [$collection, $item] = makeVersionedWriteCollection('parity-draft-rest');

    $this->patchJson("/api/v1/collections/{$collection->slug}/items/{$item->id}", [
        'data' => ['title' => 'Draft title'],
    ])->assertOk();

    $item->refresh();
    expect($item->draft_data)->toBeArray()
        ->and($item->draft_data['title'] ?? null)->toBe('Draft title')
        ->and(app(CollectionItemValuesAssembler::class)->assemble($item)['title'])->toBe('Published title');
});

it('writes draft_data on versioned GraphQL updateItem', function (): void {
    [$collection, $item] = makeVersionedWriteCollection('parity-draft-gql');

    $this->postJson('/api/graphql', [
        'query' => 'mutation ($c: String!, $id: ID!, $d: JSON!) { updateItem(collection: $c, id: $id, data: $d) { id } }',
        'variables' => [
            'c' => $collection->slug,
            'id' => (string) $item->id,
            'd' => ['title' => 'Draft title gql'],
        ],
    ])->assertOk()->assertJsonMissingPath('errors');

    $item->refresh();
    expect($item->draft_data)->toBeArray()
        ->and($item->draft_data['title'] ?? null)->toBe('Draft title gql')
        ->and(app(CollectionItemValuesAssembler::class)->assemble($item)['title'])->toBe('Published title');
});

it('keeps omitted fields on partial REST update through the shared Action', function (): void {
    [$collection, $item] = makeVersionedWriteCollection('parity-partial');

    $this->patchJson("/api/v1/collections/{$collection->slug}/items/{$item->id}", [
        'data' => ['title' => 'Only title'],
    ])->assertOk();

    $item->refresh();
    expect($item->draft_data['title'] ?? null)->toBe('Only title')
        ->and($item->draft_data['body'] ?? null)->toBe('Published body');
});

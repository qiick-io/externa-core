<?php

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemValue;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\Settings\SettingsRepository;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    app(SettingsRepository::class)->setMany(SettingsRepository::SCOPE_PROJECT, 'project', [
        'content_locales' => ['en', 'it'],
        'default_content_locale' => 'en',
        'fallback_content_locales' => ['en', 'it'],
    ]);

    $this->collection = Collection::query()->create([
        'name' => 'Partial',
        'slug' => 'partial',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    foreach (['title' => true, 'body' => false] as $name => $translatable) {
        CollectionField::factory()->create([
            'collection_id' => $this->collection->id,
            'name' => $name,
            'type' => FieldTypeEnum::String,
            'translatable' => $translatable,
        ]);
    }
    grantPublicActions($this->collection, [
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Update,
    ]);

    $this->item = $this->collection->items()->create([]);
    $normalized = app(CollectionItemDataNormalizer::class)->normalize($this->collection, [
        'title' => ['en' => 'Hello', 'it' => 'Ciao'],
        'body' => 'Keep me',
    ], true);
    app(CollectionItemValuesWriter::class)->sync($this->item, $this->collection, $normalized);
});

function partialItemValues(CollectionItem $item): array
{
    return app(CollectionItemValuesAssembler::class)->assemble($item->fresh());
}

it('keeps omitted fields and locales on public API PATCH', function (): void {
    $this->patchJson("/api/v1/collections/partial/items/{$this->item->id}", [
        'data' => ['title' => ['it' => 'Salve']],
    ])->assertOk();

    expect(partialItemValues($this->item))->toMatchArray([
        'title' => ['en' => 'Hello', 'it' => 'Salve'],
        'body' => 'Keep me',
    ]);
});

it('keeps omitted fields on GraphQL updateItem', function (): void {
    $this->postJson('/api/graphql', [
        'query' => 'mutation ($c: String!, $id: ID!, $d: JSON!) { updateItem(collection: $c, id: $id, data: $d) { id } }',
        'variables' => ['c' => 'partial', 'id' => (string) $this->item->id, 'd' => ['body' => 'Changed']],
    ])->assertOk()->assertJsonMissingPath('errors');

    expect(partialItemValues($this->item))->toMatchArray([
        'title' => ['en' => 'Hello', 'it' => 'Ciao'],
        'body' => 'Changed',
    ]);
});

it('rolls back the value sync when an insert fails', function (): void {
    CollectionItemValue::creating(function (CollectionItemValue $value): void {
        if ($value->value === 'boom') {
            throw new RuntimeException('insert failed');
        }
    });

    $normalized = app(CollectionItemDataNormalizer::class)->normalize($this->collection, [
        'title' => ['en' => 'New'],
        'body' => 'boom',
    ]);

    expect(fn () => app(CollectionItemValuesWriter::class)->sync($this->item, $this->collection, $normalized))
        ->toThrow(RuntimeException::class);

    expect(partialItemValues($this->item))->toMatchArray([
        'title' => ['en' => 'Hello', 'it' => 'Ciao'],
        'body' => 'Keep me',
    ]);
});

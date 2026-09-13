<?php

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\User;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use Database\Seeders\PermissionSeeder;
use Inertia\Testing\AssertableInertia;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('admin create and update set user_created and user_updated', function () {
    $creator = grantCollectionPermissions(User::factory()->create());
    $editor = grantCollectionPermissions(User::factory()->create());

    $collection = Collection::query()->create([
        'name' => 'Audit Notes',
        'slug' => 'audit-notes',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $this->actingAs($creator)
        ->post(route('collections.items.store', $collection), [
            'data' => ['title' => 'Hello'],
        ])
        ->assertRedirect();

    $item = $collection->items()->firstOrFail();
    expect($item->user_created_id)->toBe($creator->id)
        ->and($item->user_updated_id)->toBe($creator->id);

    $this->actingAs($editor)
        ->put(route('collections.items.update', [$collection, $item]), [
            'data' => ['title' => 'Updated'],
        ])
        ->assertRedirect();

    $item->refresh();
    expect($item->user_created_id)->toBe($creator->id)
        ->and($item->user_updated_id)->toBe($editor->id);

    $this->actingAs($editor)
        ->get(route('collections.items.show', [$collection, $item]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/items/form')
            ->where('item.user_created.id', $creator->id)
            ->where('item.user_updated.id', $editor->id));
});

test('api create without auth user leaves audit ids null', function () {
    $collection = Collection::query()->create([
        'name' => 'Api Notes',
        'slug' => 'api-notes-audit',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([]);
    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection,
        app(CollectionItemDataNormalizer::class)->normalize($collection, ['title' => 'Anon'], true),
    );

    $item->refresh();
    expect($item->user_created_id)->toBeNull()
        ->and($item->user_updated_id)->toBeNull();
});

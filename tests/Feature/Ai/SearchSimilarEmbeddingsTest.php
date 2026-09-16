<?php

use App\Ai\Tools\SearchSimilarCollectionItems;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionItemEmbedding;
use App\Models\User;
use App\Services\Ai\EmbeddingSimilarity;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Laravel\Ai\Embeddings;
use Laravel\Ai\Tools\Request;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

it('falls back to text search when embeddings disabled', function () {
    config(['ai.embeddings.enabled' => false]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    // Ensure assembler has something to scan — even empty data still returns mode
    $result = (string) (new SearchSimilarCollectionItems)->handle(new Request([
        'collection_id' => $collection->id,
        'query' => 'zzzz-no-match',
        'limit' => 5,
    ]));

    expect($result)->toContain('"mode": "semantic-lite"')
        ->and($item->id)->toBeInt();
});

it('uses embeddings mode when enabled and vectors exist', function () {
    config(['ai.embeddings.enabled' => false]);

    Embeddings::fake([
        [[0.1, 0.2, 0.3]],
    ]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    CollectionItemEmbedding::query()->create([
        'collection_item_id' => $item->id,
        'provider' => 'openai',
        'vector' => [0.1, 0.2, 0.3],
        'content_hash' => 'abc',
    ]);

    config(['ai.embeddings.enabled' => true]);

    $result = (string) (new SearchSimilarCollectionItems)->handle(new Request([
        'collection_id' => $collection->id,
        'query' => 'hello',
        'limit' => 5,
    ]));

    expect($result)->toContain('"mode": "embeddings"')
        ->and($result)->toContain((string) $item->id);
});

it('computes cosine similarity', function () {
    $sim = app(EmbeddingSimilarity::class);
    expect($sim->cosine([1.0, 0.0], [1.0, 0.0]))->toBe(1.0)
        ->and($sim->cosine([1.0, 0.0], [0.0, 1.0]))->toBe(0.0);
});

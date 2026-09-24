<?php

use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\Webhooks\OutboundWebhookCatalog;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Queue;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('schedule publish promotes draft when due via artisan command', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['versioning' => true]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([]);
    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer->sync($item, $collection, $normalizer->normalize($collection, ['title' => 'live'], true));

    $item->draft_data = ['title' => 'soon'];
    $item->publish_at = now()->addHour();
    $item->save();

    $this->travelTo(now()->addHours(2));

    $this->artisan('collections:process-schedules')
        ->assertSuccessful();

    $item->refresh();
    expect($item->draft_data)->toBeNull();
    expect($item->publish_at)->toBeNull();
    expect(app(CollectionItemValuesAssembler::class)->assemble($item)['title'])->toBe('soon');
});

test('cancel schedule clears publish_at before due', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['versioning' => true]);
    $item = $collection->items()->create([
        'draft_data' => ['title' => 'wip'],
        'publish_at' => now()->addDay(),
    ]);

    $this->post(route('collections.items.schedule', [$collection, $item]), [
        'clear' => true,
    ])->assertRedirect();

    $item->refresh();
    expect($item->publish_at)->toBeNull();
    expect($item->draft_data['title'] ?? null)->toBe('wip');
});

test('schedule publish requires draft and edit permission', function () {
    $user = grantCollectionPermissions(User::factory()->create(), [
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create(['versioning' => true]);
    $item = $collection->items()->create(['draft_data' => ['title' => 'x']]);

    $this->post(route('collections.items.schedule', [$collection, $item]), [
        'publish_at' => now()->addHour()->toIso8601String(),
    ])->assertForbidden();

    $editor = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($editor);

    $empty = $collection->items()->create([]);
    $this->post(route('collections.items.schedule', [$collection, $empty]), [
        'publish_at' => now()->addHour()->toIso8601String(),
    ])->assertRedirect()->assertSessionHas('error');
});

test('scheduled unpublish soft-deletes when due', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['versioning' => true]);
    $item = $collection->items()->create([
        'unpublish_at' => now()->addHour(),
    ]);

    $this->travelTo(now()->addHours(2));
    $this->artisan('collections:process-schedules')->assertSuccessful();

    expect(CollectionItem::withTrashed()->find($item->id)?->trashed())->toBeTrue();
});

test('catalog includes item.published', function () {
    expect(OutboundWebhookCatalog::has('item.published'))->toBeTrue();
    expect(OutboundWebhookCatalog::types())->toContain('item.published');
});

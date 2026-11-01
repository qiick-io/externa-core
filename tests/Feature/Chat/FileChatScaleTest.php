<?php

use App\Enums\FieldTypeEnum;
use App\Enums\FilePermissionActionEnum;
use App\Enums\PermissionEnum;
use App\Models\Chat;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemValue;
use App\Models\User;
use App\Notifications\ItemChatNotification;
use App\Services\Collections\CollectionItemValuesWriterService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    Storage::fake('assets');
});

/**
 * @return array{user: User, collection: Collection, item: CollectionItem}
 */
function scaleKitchen(): array
{
    $user = grantCollectionPermissions(User::factory()->create(), [
        ...allCollectionPermissions(),
        PermissionEnum::CanShowChat->value,
        PermissionEnum::CanShowFiles->value,
    ]);
    $collection = Collection::factory()->create(['name' => 'Scale Kitchen']);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = $collection->items()->create([]);

    return compact('user', 'collection', 'item');
}

it('lists files without per-row settings queries for transform urls', function (): void {
    grantPublicFileActions([FilePermissionActionEnum::Read]);

    foreach (range(1, 8) as $i) {
        makeStoredFile("shot-{$i}.jpg");
    }

    DB::flushQueryLog();
    DB::enableQueryLog();
    $response = $this->getJson('/api/v1/files?per_page=20')->assertOk();
    $queries = DB::getQueryLog();
    DB::disableQueryLog();

    $settingsHits = collect($queries)->filter(
        fn (array $q): bool => str_contains(strtolower($q['query']), 'settings'),
    )->count();

    expect($settingsHits)->toBeLessThanOrEqual(2)
        ->and($response->json('data'))->not->toBeEmpty();
});

it('chat hub collection tab stays near-constant query count as threads grow', function (): void {
    ['user' => $user, 'collection' => $collection] = scaleKitchen();
    $titleFieldId = (int) $collection->fields()->where('name', 'title')->value('id');

    foreach (range(1, 12) as $i) {
        $item = $collection->items()->create([]);
        CollectionItemValue::query()->create([
            'item_id' => $item->id,
            'field_id' => $titleFieldId,
            'locale' => null,
            'position' => 0,
            'value' => "Item {$i}",
        ]);
        Chat::query()->create([
            'kind' => Chat::KIND_ITEM,
            'collection_id' => $collection->id,
            'collection_item_id' => $item->id,
            'created_by_user_id' => $user->id,
        ]);
    }

    $this->actingAs($user);

    DB::flushQueryLog();
    DB::enableQueryLog();
    $this->getJson(route('chat.threads.index', ['tab' => 'collection', 'per_page' => 25]))
        ->assertOk()
        ->assertJsonPath('meta.total', 12);
    $count = count(DB::getQueryLog());
    DB::disableQueryLog();

    // Guard against N+1 assemble-per-row (would be ~50+). Eager fieldValues keeps this bounded.
    expect($count)->toBeLessThan(40);
});

it('writes collection item values with a single bulk insert', function (): void {
    ['collection' => $collection, 'item' => $item] = scaleKitchen();

    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'tags',
        'type' => FieldTypeEnum::Tag,
    ]);
    $collection->load('fields');

    $inserts = 0;
    DB::listen(function ($query) use (&$inserts): void {
        if (str_starts_with(strtolower($query->sql), 'insert into')
            && str_contains(strtolower($query->sql), 'collections_items_values')) {
            $inserts++;
        }
    });

    app(CollectionItemValuesWriterService::class)->sync($item, $collection, [
        'title' => 'Bulk title',
        'tags' => ['a', 'b', 'c', 'd', 'e'],
    ]);

    expect($inserts)->toBe(1)
        ->and(CollectionItemValue::query()->where('item_id', $item->id)->count())->toBe(6);
});

it('queues item chat notifications for subscribers', function (): void {
    Notification::fake();

    ['user' => $author, 'collection' => $collection, 'item' => $item] = scaleKitchen();
    $subscriber = grantCollectionPermissions(User::factory()->create(), [
        ...allCollectionPermissions(),
        PermissionEnum::CanShowChat->value,
    ]);

    $this->actingAs($subscriber)
        ->putJson(route('collections.items.chat.notify', [$collection, $item]), [
            'notify' => true,
        ])
        ->assertOk();

    $this->actingAs($author)
        ->postJson(route('collections.items.chat.store', [$collection, $item]), [
            'body' => 'hello subscribers',
        ])
        ->assertCreated();

    Notification::assertSentTo($subscriber, ItemChatNotification::class);
});

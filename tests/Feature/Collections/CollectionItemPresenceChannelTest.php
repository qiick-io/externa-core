<?php

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Broadcast;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

/**
 * @return array{user: User, collection: Collection, item: CollectionItem}
 */
function itemPresenceKitchen(): array
{
    $user = grantCollectionPermissions(User::factory()->create());
    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = $collection->items()->create([]);

    return compact('user', 'collection', 'item');
}

function useReverbBroadcasterForItemPresence(): void
{
    config([
        'broadcasting.default' => 'reverb',
        'broadcasting.connections.reverb.key' => 'local-reverb-key',
        'broadcasting.connections.reverb.secret' => 'local-reverb-secret',
        'broadcasting.connections.reverb.app_id' => 'externa-local',
    ]);

    require base_path('routes/channels.php');
}

test('presence collection-item channel returns user payload for readable items', function () {
    useReverbBroadcasterForItemPresence();

    ['user' => $user, 'collection' => $collection, 'item' => $item] = itemPresenceKitchen();
    $this->actingAs($user);

    $request = Request::create('/broadcasting/auth', 'POST', [
        'channel_name' => 'presence-collection-item.'.$collection->id.'.'.$item->id,
        'socket_id' => '1234.5678',
    ]);
    $request->setUserResolver(fn () => $user);

    $payload = Broadcast::driver('reverb')->auth($request);
    $channelData = json_decode((string) ($payload['channel_data'] ?? ''), true);

    expect($payload)->toHaveKey('auth')
        ->and($channelData)->toBeArray()
        ->and((string) ($channelData['user_id'] ?? ''))->toBe((string) $user->id)
        ->and($channelData['user_info']['id'] ?? null)->toBe($user->id);
});

test('presence collection-item channel denies users without item read access', function () {
    useReverbBroadcasterForItemPresence();

    $collection = Collection::factory()->create();
    $item = CollectionItem::query()->create(['collection_id' => $collection->id]);
    $outsider = User::factory()->create(['is_active' => true]);

    $request = Request::create('/broadcasting/auth', 'POST', [
        'channel_name' => 'presence-collection-item.'.$collection->id.'.'.$item->id,
        'socket_id' => '1234.5678',
    ]);
    $request->setUserResolver(fn () => $outsider);

    expect(fn () => Broadcast::driver('reverb')->auth($request))
        ->toThrow(AccessDeniedHttpException::class);
});

<?php

use App\Enums\PermissionEnum;
use App\Models\Chat;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Chat\ChatService;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id): bool {
    return (int) $user->id === (int) $id;
});

Broadcast::channel('online', function ($user): array|bool {
    if (! $user instanceof User || ! $user->is_active) {
        return false;
    }

    return [
        'id' => $user->id,
        'name' => $user->name,
    ];
});

Broadcast::channel('chat.{chatId}', function ($user, $chatId): array|bool {
    if (! $user instanceof User || ! $user->is_active) {
        return false;
    }

    $chat = Chat::query()->find($chatId);
    if (! $chat instanceof Chat) {
        return false;
    }

    try {
        app(ChatService::class)->assertAccessible(request(), $chat);
    } catch (Throwable) {
        return false;
    }

    $name = trim($user->name);

    return [
        'id' => $user->id,
        'name' => $name !== '' ? $name : $user->email,
    ];
});

Broadcast::channel('collection-item.{collectionId}.{itemId}', function ($user, $collectionId, $itemId): array|bool {
    if (! $user instanceof User || ! $user->is_active) {
        return false;
    }

    if (! $user->can(PermissionEnum::CanShowCollections->value)) {
        return false;
    }

    $collection = Collection::query()->find($collectionId);
    if (! $collection instanceof Collection) {
        return false;
    }

    $item = CollectionItem::query()
        ->where('collection_id', $collection->id)
        ->find($itemId);
    if (! $item instanceof CollectionItem) {
        return false;
    }

    if (! app(CollectionPermissionEnforcer::class)->isItemReadable(request(), $collection, $item)) {
        return false;
    }

    $name = trim($user->name);

    return [
        'id' => $user->id,
        'name' => $name !== '' ? $name : $user->email,
    ];
});

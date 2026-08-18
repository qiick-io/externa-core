<?php

use App\Models\Chat;
use App\Models\User;
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

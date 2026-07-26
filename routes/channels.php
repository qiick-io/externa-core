<?php

use App\Models\User;
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

<?php

use App\Models\User;
use App\Services\Api\MiniUserMapperService;

test('mini user mapper returns null for missing user', function () {
    expect(app(MiniUserMapperService::class)->toArray(null))->toBeNull();
});

test('mini user mapper maps id name email', function () {
    $user = new User([
        'first_name' => 'Ada',
        'last_name' => 'Lovelace',
        'email' => 'ada@example.com',
    ]);
    $user->id = 42;

    expect(app(MiniUserMapperService::class)->toArray($user))->toBe([
        'id' => 42,
        'name' => 'Ada Lovelace',
        'email' => 'ada@example.com',
    ]);
});

test('mini user mapper falls back to email then id when name empty', function () {
    $withEmail = new User([
        'first_name' => '',
        'last_name' => '',
        'email' => 'anon@example.com',
    ]);
    $withEmail->id = 7;

    expect(app(MiniUserMapperService::class)->toArray($withEmail))->toBe([
        'id' => 7,
        'name' => 'anon@example.com',
        'email' => 'anon@example.com',
    ]);

    $bare = new User([
        'first_name' => '',
        'last_name' => '',
        'email' => null,
    ]);
    $bare->id = 9;

    expect(app(MiniUserMapperService::class)->toArray($bare))->toBe([
        'id' => 9,
        'name' => '#9',
        'email' => null,
    ]);
});

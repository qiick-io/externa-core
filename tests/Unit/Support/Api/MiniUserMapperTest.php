<?php

use App\Models\User;
use App\Services\Api\MiniUserMapperService;

test('mini user mapper returns null for missing user', function () {
    expect(app(MiniUserMapperService::class)->toArray(null))->toBeNull();
});

test('mini user mapper maps id public_id name email', function () {
    $user = new User([
        'first_name' => 'Ada',
        'last_name' => 'Lovelace',
        'email' => 'ada@example.com',
    ]);
    $user->id = 42;
    $user->public_id = '018f3a6c-0000-7000-8000-000000000042';

    expect(app(MiniUserMapperService::class)->toArray($user))->toBe([
        'id' => 42,
        'public_id' => '018f3a6c-0000-7000-8000-000000000042',
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
    $withEmail->public_id = '018f3a6c-0000-7000-8000-000000000007';

    expect(app(MiniUserMapperService::class)->toArray($withEmail))->toBe([
        'id' => 7,
        'public_id' => '018f3a6c-0000-7000-8000-000000000007',
        'name' => 'anon@example.com',
        'email' => 'anon@example.com',
    ]);

    $bare = new User([
        'first_name' => '',
        'last_name' => '',
        'email' => null,
    ]);
    $bare->id = 9;
    $bare->public_id = '018f3a6c-0000-7000-8000-000000000009';

    expect(app(MiniUserMapperService::class)->toArray($bare))->toBe([
        'id' => 9,
        'public_id' => '018f3a6c-0000-7000-8000-000000000009',
        'name' => '#9',
        'email' => null,
    ]);
});

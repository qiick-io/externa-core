<?php

use App\Ai\Support\AiToolJsonDecoder;
use App\Ai\Tools\ManageRoles;
use App\Enums\PermissionEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Laravel\Ai\Tools\Request;
use Spatie\Permission\Models\Role;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

test('decodes tool json accepts array or json string', function () {
    $fromArray = AiToolJsonDecoder::optionalArrayFrom(new Request([
        'permission_names_json' => ['can-show-collections', 'can-create-collections'],
    ]), 'permission_names_json');

    $fromString = AiToolJsonDecoder::optionalArrayFrom(new Request([
        'permission_names_json' => '["can-show-collections","can-create-collections"]',
    ]), 'permission_names_json');

    expect($fromArray)->toBe(['can-show-collections', 'can-create-collections'])
        ->and($fromString)->toBe(['can-show-collections', 'can-create-collections']);
});

test('manage roles create accepts array permission_names_json and upserts existing role', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateRoles->value,
        PermissionEnum::CanEditRoles->value,
    ]);
    $this->actingAs($user);

    $name = 'array-role-'.uniqid();

    $first = (string) (new ManageRoles)->handle(new Request([
        'action' => 'create',
        'name' => $name,
        'permission_names_json' => [
            PermissionEnum::CanShowCollections->value,
        ],
    ]));

    expect($first)->toContain('"ok": true');

    $role = Role::query()->where('name', $name)->first();
    expect($role)->not->toBeNull()
        ->and($role->hasPermissionTo(PermissionEnum::CanShowCollections->value))->toBeTrue();

    $second = (string) (new ManageRoles)->handle(new Request([
        'action' => 'create',
        'name' => $name,
        'permission_names_json' => [
            PermissionEnum::CanShowCollections->value,
            PermissionEnum::CanCreateCollections->value,
        ],
    ]));

    expect($second)->toContain('"ok": true')
        ->and($second)->toContain('"created": false');

    $role->refresh();
    expect($role->hasPermissionTo(PermissionEnum::CanCreateCollections->value))->toBeTrue();
});

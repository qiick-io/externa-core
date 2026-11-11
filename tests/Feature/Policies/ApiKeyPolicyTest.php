<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\ApiKey;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Gate;

beforeEach(function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $this->superAdmin = User::factory()->create();
    $this->superAdmin->assignRole(RoleEnum::SuperAdmin->value);

    $this->viewer = grantAiPermissions(User::factory()->create(), [PermissionEnum::CanShowApiKeys->value]);
    $this->keyManager = grantAiPermissions(User::factory()->create(), [PermissionEnum::CanManageApiKeys->value]);
    $this->outsider = User::factory()->create();

    $this->apiKey = makeApiKeyForRole()['key'];
});

test('view any needs can-show-api-keys', function () {
    expect(Gate::forUser($this->viewer)->allows('viewAny', ApiKey::class))->toBeTrue()
        ->and(Gate::forUser($this->keyManager)->allows('viewAny', ApiKey::class))->toBeFalse()
        ->and(Gate::forUser($this->superAdmin)->allows('viewAny', ApiKey::class))->toBeTrue()
        ->and(Gate::forUser(null)->allows('viewAny', ApiKey::class))->toBeFalse();
});

test('create and delete need can-manage-api-keys', function () {
    expect(Gate::forUser($this->keyManager)->allows('create', ApiKey::class))->toBeTrue()
        ->and(Gate::forUser($this->keyManager)->allows('delete', $this->apiKey))->toBeTrue()
        ->and(Gate::forUser($this->viewer)->allows('create', ApiKey::class))->toBeFalse()
        ->and(Gate::forUser($this->viewer)->allows('delete', $this->apiKey))->toBeFalse()
        ->and(Gate::forUser($this->outsider)->allows('delete', $this->apiKey))->toBeFalse()
        ->and(Gate::forUser($this->superAdmin)->allows('create', ApiKey::class))->toBeTrue()
        ->and(Gate::forUser($this->superAdmin)->allows('delete', $this->apiKey))->toBeTrue();
});

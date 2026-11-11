<?php

declare(strict_types=1);

use App\Enums\RoleEnum;
use App\Models\CollectionItemChatMessage;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Gate;

beforeEach(function (): void {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $this->message = CollectionItemChatMessage::factory()->create();
    $this->author = User::query()->findOrFail($this->message->user_id);
});

it('lets only the author edit or delete a message, super-admins included', function (string $ability): void {
    $superAdmin = User::factory()->create();
    $superAdmin->assignRole(RoleEnum::SuperAdmin->value);

    expect(Gate::forUser($this->author)->allows($ability, $this->message))->toBeTrue()
        ->and(Gate::forUser(User::factory()->create())->allows($ability, $this->message))->toBeFalse()
        ->and(Gate::forUser($superAdmin)->allows($ability, $this->message))->toBeFalse()
        ->and(Gate::forUser(null)->allows($ability, $this->message))->toBeFalse();
})->with(['update', 'delete']);

<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Users\UserPublicIdBackfillService;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;

/**
 * Fleet users baseline: public_id UUID v7 is the external id; PK stays bigint (#827 step 2).
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('users table has a unique non-null public_id column', function (): void {
    expect(Schema::hasColumn('users', 'public_id'))->toBeTrue();

    $user = User::factory()->create();

    expect(Str::isUuid($user->public_id))->toBeTrue()
        ->and(strlen($user->public_id))->toBe(36)
        ->and($user->getKey())->toBeInt();
});

test('new users receive a uuid v7 public_id on create', function (): void {
    $user = User::factory()->create();

    expect(Str::isUuid($user->fresh()->public_id))->toBeTrue();
});

test('backfill is a no-op when every user already has a public_id', function (): void {
    User::factory()->count(2)->create();

    expect(app(UserPublicIdBackfillService::class)->missingCount())->toBe(0)
        ->and(app(UserPublicIdBackfillService::class)->backfill())->toBe(0);
});

test('route binding accepts public_id uuid as well as the bigint id', function (): void {
    $role = Role::query()->create([
        'name' => 'public-id-editor-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([PermissionEnum::CanEditUsers->value]);

    $actor = User::factory()->create();
    $actor->syncRoles([$role]);
    $target = User::factory()->create(['first_name' => 'Original']);

    $this->actingAs($actor)
        ->put(route('users.update', $target->public_id), [
            'first_name' => 'Renamed',
        ])
        ->assertRedirect(route('users.index'));

    expect($target->fresh()->first_name)->toBe('Renamed');

    $this->actingAs($actor)
        ->put(route('users.update', $target->id), [
            'first_name' => 'ById',
        ])
        ->assertRedirect(route('users.index'));

    expect($target->fresh()->first_name)->toBe('ById');
});

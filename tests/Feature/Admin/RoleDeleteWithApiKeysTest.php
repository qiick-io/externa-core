<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Models\ApiKey;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Gate;

/**
 * Deleting a role must not cascade away the API keys that still hold it (#833).
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();

    $this->actor = User::factory()->create();
    $managerRole = Role::factory()->create(['name' => 'role-delete-manager-'.uniqid()]);
    $managerRole->syncPermissions([PermissionEnum::CanDeleteRoles->value]);
    $this->actor->syncRoles([$managerRole]);
    $this->actingAs($this->actor);
});

test('single delete is refused while active API keys still use the role', function (): void {
    $role = Role::factory()->create(['name' => 'api-bound-'.uniqid()]);
    ApiKey::factory()->create(['role_id' => $role->id]);
    ApiKey::factory()->create(['role_id' => $role->id]);

    $this->delete(route('roles.destroy', $role))
        ->assertForbidden();

    expect(Role::query()->whereKey($role->id)->exists())->toBeTrue()
        ->and(ApiKey::query()->where('role_id', $role->id)->count())->toBe(2)
        ->and(Gate::forUser($this->actor)->inspect('delete', $role)->message())
        ->toBe('This role cannot be deleted while 2 API key(s) still use it.');
});

test('single delete is refused while only revoked API keys still use the role', function (): void {
    $role = Role::factory()->create(['name' => 'revoked-bound-'.uniqid()]);
    ApiKey::factory()->revoked()->create(['role_id' => $role->id]);

    $this->delete(route('roles.destroy', $role))
        ->assertForbidden();

    expect(Role::query()->whereKey($role->id)->exists())->toBeTrue()
        ->and(ApiKey::query()->where('role_id', $role->id)->count())->toBe(1)
        ->and(Gate::forUser($this->actor)->inspect('delete', $role)->message())
        ->toBe('This role cannot be deleted while 1 API key(s) still use it.');
});

test('bulk delete skips roles that API keys still use and reports them', function (): void {
    $bound = Role::factory()->create(['name' => 'bulk-bound-'.uniqid()]);
    $free = Role::factory()->create(['name' => 'bulk-free-'.uniqid()]);
    ApiKey::factory()->create(['role_id' => $bound->id]);

    $this->from(route('roles.index'))
        ->post(route('roles.bulk-actions'), [
            'action' => 'delete',
            'ids' => [$bound->id, $free->id],
        ])
        ->assertRedirect()
        ->assertSessionHas(
            'success',
            '1 role(s) deleted. 1 role(s) skipped because API keys still use them.',
        );

    expect(Role::query()->whereKey($bound->id)->exists())->toBeTrue()
        ->and(Role::query()->whereKey($free->id)->exists())->toBeFalse()
        ->and(ApiKey::query()->where('role_id', $bound->id)->exists())->toBeTrue();
});

test('bulk delete reports when every selected role is skipped for API keys', function (): void {
    $first = Role::factory()->create(['name' => 'skip-a-'.uniqid()]);
    $second = Role::factory()->create(['name' => 'skip-b-'.uniqid()]);
    ApiKey::factory()->create(['role_id' => $first->id]);
    ApiKey::factory()->revoked()->create(['role_id' => $second->id]);

    $this->from(route('roles.index'))
        ->post(route('roles.bulk-actions'), [
            'action' => 'delete',
            'ids' => [$first->id, $second->id],
        ])
        ->assertRedirect()
        ->assertSessionHas(
            'success',
            '2 role(s) skipped because API keys still use them.',
        );

    expect(Role::query()->whereKey([$first->id, $second->id])->count())->toBe(2);
});

test('a role with no API keys is still deleted', function (): void {
    $role = Role::factory()->create(['name' => 'unbound-'.uniqid()]);

    $this->delete(route('roles.destroy', $role))
        ->assertRedirect(route('roles.index'));

    expect(Role::query()->whereKey($role->id)->exists())->toBeFalse();
});

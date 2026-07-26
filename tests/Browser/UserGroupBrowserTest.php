<?php

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Models\UserGroup;
use Database\Seeders\PermissionSeeder;
use Spatie\Permission\Models\Role;

function grantBrowserGroupPermissions(User $user, array $permissions): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'browser-groups-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
        'is_assignable' => true,
    ]);
    $role->syncPermissions($permissions);
    $user->syncRoles([$role]);

    return $user;
}

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
});

it('hydrates members in the edit drawer and keeps them after a description-only save', function () {
    $actor = grantBrowserGroupPermissions(User::factory()->create(), [
        PermissionEnum::CanShowGroups->value,
        PermissionEnum::CanEditGroups->value,
        PermissionEnum::CanCreateGroups->value,
        PermissionEnum::CanDeleteGroups->value,
        PermissionEnum::CanRestoreGroups->value,
        PermissionEnum::CanForceDeleteGroups->value,
    ]);

    $member = User::factory()->create([
        'first_name' => 'Hydrated',
        'last_name' => 'Member',
        'email' => 'hydrated-member@example.com',
    ]);

    $groupRole = Role::query()->create([
        'name' => 'browser-group-role-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
        'is_assignable' => true,
    ]);

    $group = UserGroup::factory()->create([
        'name' => 'Browser Editors',
        'description' => 'Before save',
    ]);
    $group->users()->sync([$member->id]);
    $group->roles()->sync([$groupRole->id]);

    $this->actingAs($actor);

    $page = visit('/groups');

    $page->assertSee('Browser Editors')
        ->assertSee('Slug')
        ->assertNoJavaScriptErrors()
        ->click('Browser Editors')
        ->wait(0.5)
        ->assertSee('Edit group')
        ->assertSee('hydrated-member@example.com')
        ->assertSee('collection/file ACL')
        ->assertSee('Members inherit these roles')
        ->fill('#group_description', 'After browser save')
        ->click('Save')
        ->wait(1)
        ->assertDontSee('Edit group')
        ->assertSee('Browser Editors')
        ->assertNoJavaScriptErrors();

    $group->refresh();
    expect($group->description)->toBe('After browser save')
        ->and($group->users()->pluck('users.id')->all())->toContain($member->id)
        ->and($group->roles()->pluck('roles.id')->all())->toContain($groupRole->id);
});

it('supports trash restore and force delete actions', function () {
    $actor = grantBrowserGroupPermissions(User::factory()->create(), [
        PermissionEnum::CanShowGroups->value,
        PermissionEnum::CanDeleteGroups->value,
        PermissionEnum::CanRestoreGroups->value,
        PermissionEnum::CanForceDeleteGroups->value,
    ]);

    $group = UserGroup::factory()->create(['name' => 'Trash Me Please']);
    $group->delete();

    $this->actingAs($actor);

    $page = visit('/groups');

    $page->assertDontSee('Trash Me Please')
        ->click('[aria-label="Trashed groups"]')
        ->wait(1)
        ->assertQueryStringHas('trashed', '1')
        ->assertSee('Trash Me Please')
        ->assertSee('Restore')
        ->assertSee('Delete forever')
        ->assertNoJavaScriptErrors()
        ->click('Restore')
        ->wait(1);

    expect($group->fresh()->trashed())->toBeFalse();

    $group->delete();

    $page = visit('/groups?trashed=1');

    $page->assertSee('Trash Me Please')
        ->click('Delete forever')
        ->wait(1)
        ->assertDontSee('Trash Me Please')
        ->assertNoJavaScriptErrors();

    expect(UserGroup::query()->withTrashed()->find($group->id))->toBeNull();
});

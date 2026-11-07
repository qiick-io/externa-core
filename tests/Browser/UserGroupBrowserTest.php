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
        ->assertSee('Members')
        ->assertNoJavaScriptErrors()
        ->click('Browser Editors')
        ->wait(0.5)
        ->assertSee('Edit group')
        // Chip shows display name; email lives in option.label / dropdown only.
        ->assertSee('Hydrated Member')
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
        // ToggleGroupItem label is "Trash" (not "Trashed groups").
        ->click('button[aria-label="Trash"]')
        ->wait(1)
        ->assertQueryStringHas('trashed', '1')
        ->assertSee('Trash Me Please')
        // Row labels come from `common.restore` / `common.deletePermanently` since #282.
        ->assertVisible('[data-test="group-row-restore-'.$group->id.'"]')
        ->assertSeeIn('[data-test="group-row-restore-'.$group->id.'"]', 'Restore')
        ->assertVisible('[data-test="group-row-force-delete-'.$group->id.'"]')
        ->assertSeeIn('[data-test="group-row-force-delete-'.$group->id.'"]', 'Delete permanently')
        ->assertNoJavaScriptErrors()
        ->click('[data-test="group-row-restore-'.$group->id.'"]')
        ->wait(1);

    expect($group->fresh()->trashed())->toBeFalse();

    $group->delete();

    $page = visit('/groups?trashed=1');

    $page->assertSee('Trash Me Please')
        ->assertVisible('[data-test="group-row-force-delete-'.$group->id.'"]')
        ->click('[data-test="group-row-force-delete-'.$group->id.'"]')
        ->wait(0.3)
        ->assertSee('Delete group “Trash Me Please” permanently?')
        // Typed confirmation keeps the action disabled until the name matches (#230).
        ->assertVisible('[data-test="confirm-destructive-typed"]')
        ->fill('[data-test="confirm-destructive-typed"]', 'Trash Me Please')
        ->assertVisible('[data-test="confirm-destructive"]')
        ->click('[data-test="confirm-destructive"]')
        ->wait(1)
        ->assertDontSee('Trash Me Please')
        ->assertNoJavaScriptErrors();

    expect(UserGroup::query()->withTrashed()->find($group->id))->toBeNull();
});

it('shows the group name and slug in separate columns', function () {
    $actor = grantBrowserGroupPermissions(User::factory()->create(), [
        PermissionEnum::CanShowGroups->value,
    ]);

    UserGroup::factory()->create([
        'name' => 'Column Group',
    ]);

    $this->actingAs($actor);

    $page = visit('/groups');

    $page->assertSee('Column Group')
        ->assertScript("Array.from(document.querySelectorAll('thead th')).map((cell) => cell.textContent.trim()).slice(1, 3).join('|') === 'Name|Slug'")
        ->assertScript("document.querySelector('tbody tr td:nth-child(2) [data-test=\"group-avatar\"]').textContent.trim() === 'C'")
        ->assertScript("document.querySelector('tbody tr td:nth-child(2) [data-test=\"group-avatar\"]').nextElementSibling.textContent.trim() === 'Column Group'")
        ->assertScript("document.querySelector('tbody tr td:nth-child(3)').textContent.trim() === 'column-group'")
        ->assertNoJavaScriptErrors();
});

it('shows member avatars with initials and the hidden members as +N', function () {
    $actor = grantBrowserGroupPermissions(User::factory()->create(), [
        PermissionEnum::CanShowGroups->value,
    ]);

    $members = collect([
        ['first_name' => 'Ada', 'last_name' => 'Lovelace'],
        ['first_name' => 'Grace', 'last_name' => 'Hopper'],
        ['first_name' => 'Alan', 'last_name' => 'Turing'],
        ['first_name' => 'Edsger', 'last_name' => 'Dijkstra'],
    ])->map(fn (array $name): User => User::factory()->create($name));

    $group = UserGroup::factory()->create(['name' => 'Avatar Group']);
    $group->users()->sync($members->pluck('id'));

    $this->actingAs($actor);

    $page = visit('/groups');

    $selector = "[data-test=\"group-member-avatars-{$group->id}\"]";

    $page->assertSee('Avatar Group')
        ->assertPresent($selector)
        ->assertScript("document.querySelectorAll('{$selector} [data-slot=\"avatar\"]').length === 3")
        ->assertScript("Array.from(document.querySelectorAll('{$selector} [data-slot=\"avatar\"]')).map((avatar) => avatar.textContent.trim()).join(',') === 'AL,GH,AT'")
        ->assertScript("document.querySelectorAll('{$selector} [data-test=\"user-online-dot\"]').length === 0")
        ->assertScript("document.querySelector('{$selector} [data-test=\"group-member-count\"]').textContent.trim() === '+1'")
        ->assertScript("document.querySelector('{$selector}').getAttribute('aria-label') === '4 members'")
        ->assertNoJavaScriptErrors();
});

it('adds a member with the keyboard through the server-searched user picker', function () {
    $actor = grantBrowserGroupPermissions(User::factory()->create(), [
        PermissionEnum::CanShowGroups->value,
        PermissionEnum::CanEditGroups->value,
        PermissionEnum::CanShowUsers->value,
    ]);

    User::factory()->count(3)->create();
    $member = User::factory()->create([
        'first_name' => 'Picked',
        'last_name' => 'Person',
        'email' => 'picked-person@example.com',
    ]);

    $group = UserGroup::factory()->create(['name' => 'Picker Group']);

    $this->actingAs($actor);

    visit('/groups')
        ->click('Picker Group')
        ->wait(0.5)
        ->click('Select users…')
        ->assertPresent('[cmdk-input]')
        ->type('[cmdk-input]', 'picked-person')
        ->wait(1)
        ->assertSee('picked-person@example.com')
        ->keys('[cmdk-input]', 'Enter')
        ->keys('[cmdk-input]', 'Escape')
        ->assertSeeIn('[role="combobox"]', 'Picked Person')
        ->click('Save')
        ->wait(1)
        ->assertNoJavaScriptErrors();

    expect($group->users()->pluck('users.id')->all())->toBe([$member->id]);
});

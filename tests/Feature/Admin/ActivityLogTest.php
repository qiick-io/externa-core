<?php

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Models\UserGroup;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Hash;
use Inertia\Testing\AssertableInertia;
use Spatie\Activitylog\Models\Activity;
use Spatie\Permission\Models\Role;

function grantActivityLogPermissions(User $user, array $permissions): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'test-activity-log-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions($permissions);
    $user->syncRoles([$role]);

    return $user;
}

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('model create is logged with causer when user is authenticated', function () {
    $actor = grantActivityLogPermissions(User::factory()->create(), [
        PermissionEnum::CanShowActivityLogs->value,
    ]);
    $this->actingAs($actor);

    $group = UserGroup::factory()->create(['name' => 'Logged group']);

    $activity = Activity::query()
        ->where('subject_type', UserGroup::class)
        ->where('subject_id', $group->id)
        ->where('event', 'created')
        ->first();

    expect($activity)->not->toBeNull()
        ->and($activity->causer_id)->toBe($actor->id)
        ->and($activity->log_name)->toBe('default');
});

test('model update logs dirty attribute changes', function () {
    $actor = User::factory()->create();
    $this->actingAs($actor);

    $group = UserGroup::factory()->create(['name' => 'Before']);
    $group->update(['name' => 'After']);

    $activity = Activity::query()
        ->where('subject_type', UserGroup::class)
        ->where('subject_id', $group->id)
        ->where('event', 'updated')
        ->first();

    expect($activity)->not->toBeNull();

    $changes = $activity->attribute_changes?->toArray() ?? [];

    expect($changes['attributes']['name'] ?? null)->toBe('After')
        ->and($changes['old']['name'] ?? null)->toBe('Before');
});

test('login creates auth activity and updates last login fields', function () {
    $user = User::factory()->create([
        'last_login_at' => null,
        'last_login_ip' => null,
    ]);
    $user->givePermissionTo(PermissionEnum::CanShowDashboard->value);

    $this->post(route('login.store'), [
        'email' => $user->email,
        'password' => 'password',
    ])->assertRedirect(route('dashboard', absolute: false));

    $user->refresh();

    $activity = Activity::query()
        ->where('causer_id', $user->id)
        ->where('event', 'login')
        ->where('log_name', 'auth')
        ->first();

    expect($activity)->not->toBeNull()
        ->and($user->last_login_at)->not->toBeNull()
        ->and($user->last_login_ip)->not->toBeNull();
});

test('activity log index requires permission', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $this->get(route('activity-logs.index'))->assertForbidden();
});

test('authorized users can paginate activity logs', function () {
    $actor = grantActivityLogPermissions(User::factory()->create(), [
        PermissionEnum::CanShowActivityLogs->value,
    ]);
    $this->actingAs($actor);

    Activity::query()->delete();

    foreach (range(1, 26) as $index) {
        activity()
            ->causedBy($actor)
            ->event('created')
            ->log("Activity {$index}");
    }

    $this->get(route('activity-logs.index', ['page' => 2, 'per_page' => 25]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('admin/activity-logs/index')
            ->where('activityLogs.meta.current_page', 2)
            ->where('activityLogs.meta.last_page', 2)
            ->has('activityLogs.data', 1));
});

test('authorized users can filter activity logs by user and date range', function () {
    $actor = grantActivityLogPermissions(User::factory()->create(), [
        PermissionEnum::CanShowActivityLogs->value,
    ]);
    $otherUser = User::factory()->create();
    $this->actingAs($actor);

    Activity::query()->delete();

    activity()
        ->causedBy($actor)
        ->event('created')
        ->log('Actor activity');

    activity()
        ->causedBy($otherUser)
        ->event('created')
        ->log('Other user activity');

    $this->get(route('activity-logs.index', ['user_id' => $actor->id]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('admin/activity-logs/index')
            ->has('activityLogs.data', 1)
            ->where('activityLogs.data.0.description', 'Actor activity')
            ->where('filters.user_id', $actor->id)
            ->where('filters.user_ids', [$actor->id]));

    $this->get(route('activity-logs.index', ['user_ids' => [$actor->id, $otherUser->id]]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('admin/activity-logs/index')
            ->has('activityLogs.data', 2)
            ->where('filters.user_ids', [$actor->id, $otherUser->id]));

    $today = now()->toDateString();

    $this->get(route('activity-logs.index', [
        'date_from' => $today,
        'date_to' => $today,
    ]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('admin/activity-logs/index')
            ->has('activityLogs.data', 2)
            ->where('filters.date_from', $today)
            ->where('filters.date_to', $today));
});

test('user password is excluded from activity log properties', function () {
    $actor = User::factory()->create();
    $this->actingAs($actor);

    $user = User::factory()->create();
    $user->update(['password' => Hash::make('new-secret-password')]);

    $activity = Activity::query()
        ->where('subject_type', User::class)
        ->where('subject_id', $user->id)
        ->where('event', 'updated')
        ->latest('id')
        ->first();

    expect($activity)->not->toBeNull();

    $encoded = json_encode($activity->attribute_changes?->toArray() ?? []);

    expect($encoded)->not->toContain('new-secret-password')
        ->and($encoded)->not->toContain('password');
});

test('project settings update writes settings_updated activity', function () {
    $actor = grantActivityLogPermissions(User::factory()->create(), [
        PermissionEnum::CanShowActivityLogs->value,
        PermissionEnum::CanManageProjectSettings->value,
    ]);
    $this->actingAs($actor);

    $this->put(route('project.update'), baseProjectPayload([
        'name' => 'Logged HQ',
    ]))->assertRedirect(route('project.edit'));

    $activity = Activity::query()
        ->where('event', 'settings_updated')
        ->where('log_name', 'settings')
        ->latest('id')
        ->first();

    expect($activity)->not->toBeNull()
        ->and($activity->causer_id)->toBe($actor->id)
        ->and($activity->properties['keys'] ?? null)->toContain('name');
});

test('activity log index exposes manual property meta for expanded details', function () {
    $actor = grantActivityLogPermissions(User::factory()->create(), [
        PermissionEnum::CanShowActivityLogs->value,
    ]);
    $this->actingAs($actor);

    Activity::query()->delete();

    activity()
        ->causedBy($actor)
        ->useLog('chat')
        ->event('chat_message')
        ->withProperties([
            'body_preview' => 'Hello audit',
            'attachment_count' => 0,
        ])
        ->log('Chat message sent');

    $this->get(route('activity-logs.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('admin/activity-logs/index')
            ->has('activityLogs.data', 1)
            ->where('activityLogs.data.0.properties.meta.body_preview', 'Hello audit')
            ->where('activityLogs.data.0.properties.meta.attachment_count', 0));
});

test('role permission sync writes permissions_synced activity', function () {
    $actor = grantActivityLogPermissions(User::factory()->create(), [
        PermissionEnum::CanShowActivityLogs->value,
        PermissionEnum::CanCreateRoles->value,
        PermissionEnum::CanEditRoles->value,
    ]);
    $this->actingAs($actor);

    $permission = \Spatie\Permission\Models\Permission::query()
        ->where('name', PermissionEnum::CanShowUsers->value)
        ->firstOrFail();

    $this->post(route('roles.store'), [
        'name' => 'activity-role-'.uniqid(),
        'permission_ids' => [$permission->id],
    ])->assertRedirect(route('roles.index'));

    $activity = Activity::query()
        ->where('event', 'permissions_synced')
        ->latest('id')
        ->first();

    expect($activity)->not->toBeNull()
        ->and($activity->properties['permission_ids'] ?? [])->toContain($permission->id);
});

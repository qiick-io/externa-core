<?php

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Notifications\FileDuplicationCompletedNotification;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('guests cannot access notification routes', function () {
    $this->getJson(route('notifications.index'))->assertUnauthorized();
    $this->getJson(route('notifications.unread-count'))->assertUnauthorized();
    $this->postJson(route('notifications.read'))->assertUnauthorized();
    $this->postJson(route('notifications.unread'), ['ids' => [(string) Str::uuid()]])
        ->assertUnauthorized();
});

test('users can list only their notifications and mark them read', function () {
    $owner = User::factory()->create();
    $other = User::factory()->create();

    $owner->notify(new FileDuplicationCompletedNotification(
        jobId: (string) Str::uuid(),
        count: 1,
        firstFileId: 10,
        firstFilePath: '/Docs copy',
        folderId: 10,
    ));
    $other->notify(new FileDuplicationCompletedNotification(
        jobId: (string) Str::uuid(),
        count: 2,
        firstFileId: 20,
        firstFilePath: '/Other',
        folderId: 20,
    ));

    $this->actingAs($owner);

    $this->getJson(route('notifications.unread-count'))
        ->assertOk()
        ->assertJsonPath('count', 1);

    $listResponse = $this->getJson(route('notifications.index'))
        ->assertOk();

    expect($listResponse->json('data'))->toHaveCount(1);
    expect($listResponse->json('data.0.data.folder_id'))->toBe(10);
    expect($listResponse->json('total'))->toBe(1);

    $notificationId = $listResponse->json('data.0.id');

    $this->postJson(route('notifications.read'), [
        'ids' => [$notificationId],
    ])
        ->assertOk()
        ->assertJsonPath('unread_count', 0);

    expect($owner->fresh()->unreadNotifications()->count())->toBe(0);
    expect($other->fresh()->unreadNotifications()->count())->toBe(1);
});

test('users can mark notifications unread by ids without touching others', function () {
    $owner = User::factory()->create();
    $other = User::factory()->create();

    $owner->notify(new FileDuplicationCompletedNotification(
        jobId: (string) Str::uuid(),
        count: 1,
        firstFileId: 10,
        firstFilePath: '/Docs copy',
        folderId: 10,
    ));
    $other->notify(new FileDuplicationCompletedNotification(
        jobId: (string) Str::uuid(),
        count: 2,
        firstFileId: 20,
        firstFilePath: '/Other',
        folderId: 20,
    ));

    $this->actingAs($owner);

    $ownerNotificationId = $owner->notifications()->firstOrFail()->id;
    $otherNotificationId = $other->notifications()->firstOrFail()->id;

    $this->postJson(route('notifications.read'), [
        'ids' => [$ownerNotificationId],
    ])
        ->assertOk()
        ->assertJsonPath('unread_count', 0);

    $this->postJson(route('notifications.unread'), [
        'ids' => [$ownerNotificationId, $otherNotificationId],
    ])
        ->assertOk()
        ->assertJsonPath('unread_count', 1);

    expect($owner->fresh()->unreadNotifications()->count())->toBe(1);
    expect($owner->fresh()->notifications()->firstOrFail()->read_at)->toBeNull();
    expect($other->fresh()->unreadNotifications()->count())->toBe(1);
});

test('mark unread requires a non-empty ids list', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->postJson(route('notifications.unread'), [])
        ->assertUnprocessable();

    $this->actingAs($user)
        ->postJson(route('notifications.unread'), ['ids' => []])
        ->assertUnprocessable();
});

test('users can mark all notifications read', function () {
    $user = User::factory()->create();

    $user->notify(new FileDuplicationCompletedNotification(
        jobId: (string) Str::uuid(),
        count: 1,
        firstFileId: 1,
        firstFilePath: '/a',
        folderId: null,
    ));
    $user->notify(new FileDuplicationCompletedNotification(
        jobId: (string) Str::uuid(),
        count: 1,
        firstFileId: 2,
        firstFilePath: '/b',
        folderId: null,
    ));

    $this->actingAs($user);

    $this->postJson(route('notifications.read'), [
        'all' => true,
    ])
        ->assertOk()
        ->assertJsonPath('unread_count', 0);

    expect($user->fresh()->unreadNotifications()->count())->toBe(0);
});

test('inertia shares unread notification count', function () {
    $role = Role::query()->firstOrCreate([
        'name' => 'test-notifications-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([PermissionEnum::CanShowDashboard->value]);

    $user = User::factory()->create();
    $user->syncRoles([$role]);
    $user->notify(new FileDuplicationCompletedNotification(
        jobId: (string) Str::uuid(),
        count: 1,
        firstFileId: null,
        firstFilePath: null,
        folderId: null,
    ));

    $this->actingAs($user)
        ->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->has('notifications.unread_count')
            ->where('notifications.unread_count', 1));
});

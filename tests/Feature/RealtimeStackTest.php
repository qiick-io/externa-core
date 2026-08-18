<?php

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\User;
use App\Notifications\FileDuplicationCompletedNotification;
use App\Notifications\ItemChatNotification;
use App\Services\Dashboard\DashboardHealthMetrics;
use Database\Seeders\PermissionSeeder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

function redisAvailable(): bool
{
    try {
        Redis::connection()->ping();

        return true;
    } catch (Throwable) {
        return false;
    }
}

/**
 * phpunit uses BROADCAST_CONNECTION=null, so boot-time channel registration
 * lands on NullBroadcaster. Re-bind onto reverb for auth tests.
 */
function useReverbBroadcaster(): void
{
    config([
        'broadcasting.default' => 'reverb',
        'broadcasting.connections.reverb.key' => 'local-reverb-key',
        'broadcasting.connections.reverb.secret' => 'local-reverb-secret',
        'broadcasting.connections.reverb.app_id' => 'externa-local',
    ]);

    require base_path('routes/channels.php');
}

function makeSuperAdmin(): User
{
    $user = User::factory()->create();
    $role = Role::query()->firstOrCreate([
        'name' => RoleEnum::SuperAdmin->value,
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $user->syncRoles([$role]);

    return $user;
}

test('viewHorizon gate allows super-admin and denies others', function () {
    $admin = makeSuperAdmin();
    $user = User::factory()->create();

    expect(Gate::forUser($admin)->allows('viewHorizon'))->toBeTrue();
    expect(Gate::forUser($user)->allows('viewHorizon'))->toBeFalse();
});

test('viewPulse gate allows super-admin and denies others', function () {
    $admin = makeSuperAdmin();
    $user = User::factory()->create();

    expect(Gate::forUser($admin)->allows('viewPulse'))->toBeTrue();
    expect(Gate::forUser($user)->allows('viewPulse'))->toBeFalse();
});

test('private user channel authorizes owner only', function () {
    useReverbBroadcaster();

    $owner = User::factory()->create();
    $other = User::factory()->create();

    $ownerRequest = Request::create('/broadcasting/auth', 'POST', [
        'channel_name' => 'private-App.Models.User.'.$owner->id,
        'socket_id' => '1234.5678',
    ]);
    $ownerRequest->setUserResolver(fn () => $owner);

    expect(Broadcast::driver('reverb')->auth($ownerRequest))->toBeArray()->toHaveKey('auth');

    $otherRequest = Request::create('/broadcasting/auth', 'POST', [
        'channel_name' => 'private-App.Models.User.'.$owner->id,
        'socket_id' => '1234.5678',
    ]);
    $otherRequest->setUserResolver(fn () => $other);

    expect(fn () => Broadcast::driver('reverb')->auth($otherRequest))
        ->toThrow(AccessDeniedHttpException::class);
});

test('presence online channel returns user payload for active users', function () {
    useReverbBroadcaster();

    $user = User::factory()->create(['is_active' => true]);

    $request = Request::create('/broadcasting/auth', 'POST', [
        'channel_name' => 'presence-online',
        'socket_id' => '1234.5678',
    ]);
    $request->setUserResolver(fn () => $user);

    $payload = Broadcast::driver('reverb')->auth($request);
    $channelData = json_decode((string) ($payload['channel_data'] ?? ''), true);

    expect($payload)->toHaveKey('auth')
        ->and($channelData)->toBeArray()
        ->and((string) ($channelData['user_id'] ?? ''))->toBe((string) $user->id)
        ->and($channelData['user_info']['id'] ?? null)->toBe($user->id);
});

test('file notifications broadcast when realtime driver is configured', function () {
    config(['broadcasting.default' => 'reverb']);

    $user = User::factory()->create();
    $notification = new FileDuplicationCompletedNotification(
        jobId: (string) Str::uuid(),
        count: 1,
        firstFileId: 1,
        firstFilePath: '/a',
        folderId: null,
    );

    expect($notification->via($user))->toBe(['database', 'broadcast'])
        ->and($notification->toBroadcast($user)->connection)->toBe('sync');
});

test('item chat notifications broadcast on the sync queue', function () {
    config(['broadcasting.default' => 'reverb']);

    $user = User::factory()->create();
    $notification = new ItemChatNotification(
        chatId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        collectionId: 1,
        itemId: 2,
        messageId: 3,
        authorName: 'Ada',
        excerpt: 'hello',
        mentioned: true,
    );

    expect($notification->via($user))->toBe(['database', 'broadcast'])
        ->and($notification->toBroadcast($user)->connection)->toBe('sync')
        ->and($notification->toArray($user)['type'] ?? null)->toBe('chat')
        ->and($notification->toArray($user)['url'] ?? null)->toBe('/chat/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
});

test('file notifications skip broadcast on log driver', function () {
    config(['broadcasting.default' => 'log']);

    $user = User::factory()->create();
    $notification = new FileDuplicationCompletedNotification(
        jobId: (string) Str::uuid(),
        count: 1,
        firstFileId: 1,
        firstFilePath: '/a',
        folderId: null,
    );

    expect($notification->via($user))->toBe(['database']);
});

test('inertia shares realtime flag and dashboard health props', function () {
    $role = Role::query()->firstOrCreate([
        'name' => 'test-realtime-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([PermissionEnum::CanShowDashboard->value]);

    $user = User::factory()->create();
    $user->syncRoles([$role]);

    config(['broadcasting.default' => 'log']);

    $this->actingAs($user)
        ->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('realtime.enabled', false)
            ->where('realtime.broadcaster', 'log')
            ->has('health.queue_connection')
            ->has('health.broadcast_connection')
            ->has('health.redis_ok')
            ->has('health.failed_jobs'));
});

test('dashboard health metrics service returns expected keys', function () {
    $summary = app(DashboardHealthMetrics::class)->summary();

    expect($summary)->toHaveKeys([
        'queue_connection',
        'broadcast_connection',
        'pulse_enabled',
        'pulse_ingest',
        'pulse_available',
        'redis_ok',
        'failed_jobs',
        'pending_jobs',
        'exceptions_24h',
        'slow_jobs_24h',
        'slow_queries_24h',
        'horizon',
    ]);

    expect($summary['horizon'])->toHaveKeys([
        'available',
        'status',
        'masters',
        'processes',
        'pending',
        'failed',
        'jobs_per_minute',
        'throughput',
        'workloads',
    ]);
});

test('redis queue smoke when redis is available', function () {
    if (! redisAvailable()) {
        $this->markTestSkipped('Redis not available');
    }

    config(['queue.default' => 'redis']);

    expect(config('queue.default'))->toBe('redis');
    expect(Redis::connection()->ping())->not->toBeEmpty();
});

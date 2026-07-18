<?php

use App\Ai\Agents\AppAssistant;
use App\Ai\Tools\QueryActivityLogs;
use App\Enums\PermissionEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Laravel\Ai\Tools\Request;
use Spatie\Activitylog\Models\Activity;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
});

test('query activity logs tool is registered when user can show activity logs', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowActivityLogs->value,
    ]);

    $tools = collect((new AppAssistant($user))->tools())
        ->map(fn ($tool): string => class_basename($tool))
        ->all();

    expect($tools)->toContain('QueryActivityLogs');
});

test('query activity logs tool is not registered without permission', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $tools = collect((new AppAssistant($user))->tools())
        ->map(fn ($tool): string => class_basename($tool))
        ->all();

    expect($tools)->not->toContain('QueryActivityLogs');
});

test('query activity logs returns activities with permission', function () {
    $actor = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowActivityLogs->value,
    ]);
    $this->actingAs($actor);

    Activity::query()->delete();

    activity()
        ->causedBy($actor)
        ->event('created')
        ->inLog('default')
        ->log('Actor created something');

    $result = (string) (new QueryActivityLogs)->handle(new Request([
        'limit' => 10,
    ]));

    expect($result)->not->toContain('Permesso mancante')
        ->and($result)->toContain('Actor created something')
        ->and($result)->toContain('"event": "created"')
        ->and($result)->toContain('"log_name": "default"')
        ->and($result)->toContain($actor->email);
});

test('query activity logs denies without permission', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $this->actingAs($user);

    $result = (string) (new QueryActivityLogs)->handle(new Request([]));

    expect($result)->toContain('Permesso mancante')
        ->and($result)->toContain(PermissionEnum::CanShowActivityLogs->value);
});

test('query activity logs filters by user event log name and search', function () {
    $actor = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowActivityLogs->value,
    ]);
    $otherUser = User::factory()->create();
    $this->actingAs($actor);

    Activity::query()->delete();

    activity()
        ->causedBy($actor)
        ->event('ai_tool')
        ->inLog('ai')
        ->withProperties(['tool' => 'ManageFiles'])
        ->log('AI tool ManageFiles');

    activity()
        ->causedBy($otherUser)
        ->event('created')
        ->inLog('default')
        ->log('Other user created');

    activity()
        ->causedBy($actor)
        ->event('login')
        ->inLog('auth')
        ->log('Actor logged in');

    // Seeded rows only — avoid counting ai_tool rows written by withAiToolLogging.
    $seededByActor = Activity::query()
        ->where('causer_id', $actor->id)
        ->whereIn('description', ['AI tool ManageFiles', 'Actor logged in'])
        ->count();
    expect($seededByActor)->toBe(2);

    $byUser = json_decode((string) (new QueryActivityLogs)->handle(new Request([
        'user_id' => $actor->id,
        'search' => 'Actor logged',
        'limit' => 50,
    ])), true);

    expect(collect($byUser['activities'])->pluck('description')->all())
        ->toContain('Actor logged in')
        ->not->toContain('Other user created');

    $byEvent = json_decode((string) (new QueryActivityLogs)->handle(new Request([
        'event' => 'ai_tool',
        'search' => 'AI tool ManageFiles',
        'log_name' => 'ai',
    ])), true);

    expect($byEvent['count'])->toBeGreaterThanOrEqual(1)
        ->and(collect($byEvent['activities'])->firstWhere('description', 'AI tool ManageFiles'))
        ->not->toBeNull()
        ->and(collect($byEvent['activities'])->firstWhere('description', 'AI tool ManageFiles')['properties']['tool'] ?? null)
        ->toBe('ManageFiles');

    $byLog = json_decode((string) (new QueryActivityLogs)->handle(new Request([
        'log_name' => 'auth',
        'search' => 'Actor logged',
    ])), true);

    expect($byLog['count'])->toBe(1)
        ->and($byLog['activities'][0]['event'])->toBe('login');

    $bySearch = json_decode((string) (new QueryActivityLogs)->handle(new Request([
        'search' => 'Other user',
    ])), true);

    expect($bySearch['count'])->toBe(1)
        ->and($bySearch['activities'][0]['description'])->toBe('Other user created');
});

test('query activity logs rejects relative date filters without sql error', function () {
    $actor = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowActivityLogs->value,
    ]);
    $this->actingAs($actor);

    $result = json_decode((string) (new QueryActivityLogs)->handle(new Request([
        'log_name' => 'auth',
        'date_from' => 'last week',
    ])), true);

    expect($result['error'] ?? null)->toContain('YYYY-MM-DD')
        ->and($result['count'])->toBe(0)
        ->and($result['activities'])->toBe([]);
});

test('query activity logs accepts pipe-separated auth events', function () {
    $actor = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowActivityLogs->value,
    ]);
    $this->actingAs($actor);

    Activity::query()->delete();

    activity()->causedBy($actor)->event('login')->inLog('auth')->log('Actor logged in');
    activity()->causedByAnonymous()->event('failed')->inLog('auth')->log('Failed login attempt');
    activity()->causedBy($actor)->event('created')->inLog('default')->log('Unrelated create');

    $result = json_decode((string) (new QueryActivityLogs)->handle(new Request([
        'event' => 'login|failed',
        'log_name' => 'auth',
    ])), true);

    expect($result['count'])->toBe(2)
        ->and(collect($result['activities'])->pluck('event')->sort()->values()->all())
        ->toBe(['failed', 'login']);
});

test('query activity logs maps failed_login alias and exposes identifier', function () {
    $actor = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowActivityLogs->value,
    ]);
    $this->actingAs($actor);

    Activity::query()->delete();

    activity()
        ->causedByAnonymous()
        ->event('failed')
        ->inLog('auth')
        ->withProperties(['identifier' => 'attacker@example.com'])
        ->log('Failed login attempt');

    $result = json_decode((string) (new QueryActivityLogs)->handle(new Request([
        'event' => 'failed_login',
        'log_name' => 'auth',
    ])), true);

    expect($result['count'])->toBe(1)
        ->and($result['activities'][0]['event'])->toBe('failed')
        ->and($result['activities'][0]['properties']['identifier'] ?? null)->toBe('attacker@example.com');
});

test('query activity logs caps limit at 50', function () {
    $actor = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowActivityLogs->value,
    ]);
    $this->actingAs($actor);

    Activity::query()->delete();

    foreach (range(1, 55) as $index) {
        activity()
            ->causedBy($actor)
            ->event('created')
            ->log("Activity {$index}");
    }

    $result = json_decode((string) (new QueryActivityLogs)->handle(new Request([
        'limit' => 100,
    ])), true);

    expect($result['limit'])->toBe(50)
        ->and($result['count'])->toBe(50);
});

<?php

declare(strict_types=1);

use App\Enums\PendingToolCallStatusEnum;
use App\Enums\PermissionEnum;
use App\Models\PendingToolCall;
use App\Models\User;
use App\Services\Ai\AiToolApprovalService;
use App\Services\Ai\AiToolExecutorService;
use Database\Seeders\PermissionSeeder;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Spatie\Activitylog\Models\Activity;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
    config([
        'ai.tools.enabled' => true,
        'ai.tools.write_enabled' => true,
        'ai.tools.write_allow' => ['ManageCollections'],
        'ai.tools.approval_ttl_minutes' => 15,
    ]);
});

it('lists pending MCP tool calls for AI users and redacts arguments in the payload', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);

    PendingToolCall::factory()->create([
        'tool' => 'ManageCollections',
        'arguments' => [
            'action' => 'create',
            'password' => 'super-secret',
            'name' => 'Demo',
        ],
        'requested_by' => $user->id,
    ]);

    $this->actingAs($user)
        ->get(route('pending-tool-calls.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('admin/pending-tool-calls/index')
            ->has('pending', 1)
            ->where('pending.0.tool', 'ManageCollections')
            ->where('pending.0.arguments.password', '[redacted]')
            ->where('pending.0.arguments.name', 'Demo'));
});

it('approves a pending call through the admin action when the approver has permission', function (): void {
    $actor = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);
    $approver = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);

    $pendingOutcome = app(AiToolExecutorService::class)->execute(
        'ManageCollections',
        ['action' => 'list'],
        $actor,
        ['surface' => 'mcp'],
    );

    $pending = PendingToolCall::query()->where('uuid', $pendingOutcome->pendingId)->firstOrFail();

    $this->actingAs($approver)
        ->post(route('pending-tool-calls.approve', $pending))
        ->assertRedirect();

    expect($pending->refresh()->status)->toBe(PendingToolCallStatusEnum::Executed);
});

it('rejects a pending call without executing it', function (): void {
    $actor = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);
    $approver = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);

    $pending = PendingToolCall::factory()->create([
        'tool' => 'ManageCollections',
        'arguments' => ['action' => 'list'],
        'requested_by' => $actor->id,
    ]);

    $this->actingAs($approver)
        ->post(route('pending-tool-calls.reject', $pending))
        ->assertRedirect();

    expect($pending->refresh()->status)->toBe(PendingToolCallStatusEnum::Rejected);

    $outcome = app(AiToolExecutorService::class)->execute(
        'ManageCollections',
        ['action' => 'list'],
        $actor,
        [
            'surface' => 'mcp',
            'pending_id' => $pending->uuid,
            'approved_by' => $approver,
            'include_write' => true,
        ],
    );

    expect($outcome->status)->toBe('denied');
});

it('refuses approval when the approver lacks the tool permission', function (): void {
    $actor = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);
    $approver = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $pending = PendingToolCall::factory()->create([
        'tool' => 'ManageCollections',
        'arguments' => ['action' => 'list'],
        'requested_by' => $actor->id,
    ]);

    $this->actingAs($approver)
        ->from(route('pending-tool-calls.index'))
        ->post(route('pending-tool-calls.approve', $pending))
        ->assertRedirect(route('pending-tool-calls.index'))
        ->assertSessionHas('error');

    expect($pending->refresh()->status)->toBe(PendingToolCallStatusEnum::Pending);
});

it('expires overdue pending calls via the approval service', function (): void {
    $pending = PendingToolCall::factory()->expired()->create([
        'tool' => 'ManageCollections',
        'arguments' => ['action' => 'list'],
    ]);

    $count = app(AiToolApprovalService::class)->expireOverdue();

    expect($count)->toBe(1)
        ->and($pending->refresh()->status)->toBe(PendingToolCallStatusEnum::Expired);
});

it('writes an audit entry for denied and pending MCP paths', function (): void {
    config(['ai.tools.write_enabled' => false]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);

    app(AiToolExecutorService::class)->execute(
        'ManageCollections',
        ['action' => 'list'],
        $user,
        ['surface' => 'mcp'],
    );

    expect(Activity::query()->inLog('ai')->forEvent('ai_tool')->count())->toBeGreaterThan(0);
});

it('approves a call only once when two approvals race (#441)', function (): void {
    $approver = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);
    $pending = PendingToolCall::factory()->create([
        'tool' => 'ManageCollections',
        'arguments' => ['action' => 'list'],
    ]);

    // Both requests passed their pending check; the first one wins the conditional update.
    $first = PendingToolCall::query()->findOrFail($pending->id);
    $second = PendingToolCall::query()->findOrFail($pending->id);
    $resolveOnce = new ReflectionMethod(AiToolApprovalService::class, 'resolveOnce');
    $approvals = app(AiToolApprovalService::class);

    $resolveOnce->invoke($approvals, $first, PendingToolCallStatusEnum::Approved, $approver, 'approved');

    expect(fn () => $resolveOnce->invoke($approvals, $second, PendingToolCallStatusEnum::Approved, $approver, 'approved'))
        ->toThrow(InvalidArgumentException::class, 'no longer awaiting approval');
});

it('runs the tool once when a second approval lands while the first is deciding (#441)', function (): void {
    [$requester, $approver] = collect(range(1, 2))->map(fn (): User => grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]))->all();
    $pending = PendingToolCall::factory()->create([
        'tool' => 'ManageCollections',
        'arguments' => ['action' => 'list'],
        'requested_by' => $requester->id,
    ]);
    $executor = app(AiToolExecutorService::class);
    $concurrentOutcome = null;

    // The first click has read the call as pending; the second click runs to completion before
    // the first one decides, which is the interleaving two concurrent requests produce.
    DB::listen(function (QueryExecuted $query) use (&$concurrentOutcome, $executor, $pending, $approver): void {
        if ($concurrentOutcome !== null || ! str_starts_with(strtolower($query->sql), 'select')
            || ! str_contains($query->sql, 'pending_tool_calls')) {
            return;
        }

        $concurrentOutcome = false;
        $concurrentOutcome = $executor->approveAndExecute(PendingToolCall::query()->findOrFail($pending->id), $approver);
    });

    $firstOutcome = $executor->approveAndExecute($pending, $approver);

    $executions = Activity::query()->inLog('ai')->get()->filter(
        fn (Activity $activity): bool => $activity->properties->get('decision') === 'executed'
            && $activity->properties->get('pending_id') === $pending->uuid,
    );

    expect($concurrentOutcome->status)->toBe('ok')
        ->and($firstOutcome->status)->toBe('denied')
        ->and($firstOutcome->message)->toContain('no longer awaiting approval')
        ->and($executions)->toHaveCount(1)
        ->and($pending->refresh()->status)->toBe(PendingToolCallStatusEnum::Executed);
});

it('refuses a reject from a user who could not approve the call', function (): void {
    $actor = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);
    $bystander = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $pending = PendingToolCall::factory()->create([
        'tool' => 'ManageCollections',
        'arguments' => ['action' => 'list'],
        'requested_by' => $actor->id,
    ]);

    $this->actingAs($bystander)
        ->from(route('pending-tool-calls.index'))
        ->post(route('pending-tool-calls.reject', $pending))
        ->assertRedirect(route('pending-tool-calls.index'))
        ->assertSessionHas('error');

    expect($pending->refresh()->status)->toBe(PendingToolCallStatusEnum::Pending);
});

it('lets the requester withdraw their own call', function (): void {
    $requester = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $pending = PendingToolCall::factory()->create([
        'tool' => 'ManageCollections',
        'arguments' => ['action' => 'list'],
        'requested_by' => $requester->id,
    ]);

    $this->actingAs($requester)
        ->post(route('pending-tool-calls.reject', $pending))
        ->assertRedirect()
        ->assertSessionHas('success');

    expect($pending->refresh()->status)->toBe(PendingToolCallStatusEnum::Rejected);
});

<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\PendingToolCall;
use App\Models\User;
use App\Services\Ai\AiToolApprovalService;
use App\Services\Ai\AiToolExecutorService;
use App\Services\Ai\AiToolWriteGateService;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    config([
        'ai.tools.enabled' => true,
        'ai.tools.write_enabled' => false,
        'ai.tools.write_allow' => [],
        'ai.tools.allow' => [],
        'ai.tools.deny' => [],
    ]);
});

it('returns invalid_args when required schema fields are missing', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);

    $outcome = app(AiToolExecutorService::class)->execute(
        'QueryCollectionItems',
        [],
        $user,
    );

    expect($outcome->status)->toBe('invalid_args')
        ->and($outcome->message)->toContain('collection_id');
});

it('returns denied when the actor lacks abilities', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $outcome = app(AiToolExecutorService::class)->execute(
        'QueryCollectionItems',
        ['collection_id' => 1],
        $user,
    );

    expect($outcome->status)->toBe('denied');
});

it('returns denied for write tools when the kill switch is off', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);

    $outcome = app(AiToolExecutorService::class)->execute(
        'ManageCollections',
        ['action' => 'list'],
        $user,
        ['surface' => 'mcp'],
    );

    expect($outcome->status)->toBe('denied');
});

it('returns denied for write tools when enabled globally but not allowlisted', function (): void {
    config(['ai.tools.write_enabled' => true, 'ai.tools.write_allow' => []]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);

    $outcome = app(AiToolExecutorService::class)->execute(
        'ManageCollections',
        ['action' => 'list'],
        $user,
        ['surface' => 'mcp'],
    );

    expect($outcome->status)->toBe('denied');
});

it('queues a pending approval for MCP write tools when allowlisted', function (): void {
    config([
        'ai.tools.write_enabled' => true,
        'ai.tools.write_allow' => ['ManageCollections'],
    ]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);

    $outcome = app(AiToolExecutorService::class)->execute(
        'ManageCollections',
        ['action' => 'list'],
        $user,
        ['surface' => 'mcp'],
    );

    expect($outcome->status)->toBe('pending_approval')
        ->and($outcome->pendingId)->not->toBeNull();

    expect(PendingToolCall::query()->where('uuid', $outcome->pendingId)->exists())->toBeTrue();
});

it('executes an approved pending MCP write when the approver has permission', function (): void {
    config([
        'ai.tools.write_enabled' => true,
        'ai.tools.write_allow' => ['ManageCollections'],
    ]);

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

    $outcome = app(AiToolExecutorService::class)->approveAndExecute($pending, $approver);

    expect($outcome->status)->toBe('ok')
        ->and($outcome->result)->not->toBeNull();
});

it('denies execution when the approver lacks the underlying permission', function (): void {
    config([
        'ai.tools.write_enabled' => true,
        'ai.tools.write_allow' => ['ManageCollections'],
    ]);

    $actor = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);
    $approver = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $pendingOutcome = app(AiToolExecutorService::class)->execute(
        'ManageCollections',
        ['action' => 'list'],
        $actor,
        ['surface' => 'mcp'],
    );

    $pending = PendingToolCall::query()->where('uuid', $pendingOutcome->pendingId)->firstOrFail();

    $outcome = app(AiToolExecutorService::class)->approveAndExecute($pending, $approver);

    expect($outcome->status)->toBe('denied')
        ->and($outcome->message)->toContain('Approver');
});

it('never executes rejected or expired pending calls', function (): void {
    config([
        'ai.tools.write_enabled' => true,
        'ai.tools.write_allow' => ['ManageCollections'],
    ]);

    $actor = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);
    $approver = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);
    $executor = app(AiToolExecutorService::class);

    $rejectedPending = PendingToolCall::factory()->create([
        'tool' => 'ManageCollections',
        'arguments' => ['action' => 'list'],
        'requested_by' => $actor->id,
    ]);
    app(AiToolApprovalService::class)->reject($rejectedPending, $approver);

    $rejected = $executor->execute(
        'ManageCollections',
        ['action' => 'list'],
        $actor,
        [
            'surface' => 'mcp',
            'pending_id' => $rejectedPending->uuid,
            'approved_by' => $approver,
            'include_write' => true,
        ],
    );

    expect($rejected->status)->toBe('denied');

    $expiredPending = PendingToolCall::factory()->expired()->create([
        'tool' => 'ManageCollections',
        'arguments' => ['action' => 'list'],
        'requested_by' => $actor->id,
    ]);

    $expired = $executor->execute(
        'ManageCollections',
        ['action' => 'list'],
        $actor,
        [
            'surface' => 'mcp',
            'pending_id' => $expiredPending->uuid,
            'approved_by' => $approver,
            'include_write' => true,
        ],
    );

    expect($expired->status)->toBe('denied');
});

it('executes a read tool when allowed and writes an audit entry', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);
    $collection = Collection::factory()->create();

    $outcome = app(AiToolExecutorService::class)->execute(
        'QueryCollectionItems',
        ['collection_id' => $collection->id],
        $user,
    );

    expect($outcome->status)->toBe('ok')
        ->and($outcome->result)->toContain('"collection_id": '.$collection->id);

    expect(Activity::query()->inLog('ai')->forEvent('ai_tool')->count())->toBeGreaterThan(0);
});

it('returns disabled when the registry master switch is off', function (): void {
    config(['ai.tools.enabled' => false]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);

    $outcome = app(AiToolExecutorService::class)->execute(
        'QueryCollectionItems',
        ['collection_id' => 1],
        $user,
    );

    expect($outcome->status)->toBe('disabled');
});

it('returns not_found for unknown tools', function (): void {
    $outcome = app(AiToolExecutorService::class)->execute(
        'DoesNotExist',
        [],
        User::factory()->create(),
    );

    expect($outcome->status)->toBe('not_found');
});

it('honours project settings write_tools allowlist via the write gate', function (): void {
    config(['ai.tools.write_enabled' => true, 'ai.tools.write_allow' => []]);

    app(AiToolWriteGateService::class)->setEnabledWriteToolNames(['ManageFiles']);

    expect(app(AiToolWriteGateService::class)->isToolWriteAllowed('ManageFiles'))->toBeTrue()
        ->and(app(AiToolWriteGateService::class)->isToolWriteAllowed('ManageCollections'))->toBeFalse();
});

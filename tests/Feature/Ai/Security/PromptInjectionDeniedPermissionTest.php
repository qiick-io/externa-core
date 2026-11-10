<?php

declare(strict_types=1);

use App\Mcp\Adapters\RegistryMcpToolAdapter;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\File;
use App\Models\PendingToolCall;
use App\Models\User;
use App\Services\Ai\AiToolExecutorService;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Spatie\Activitylog\Models\Activity;
use Tests\Feature\Ai\Security\Support\AiSecurityFixture;
use Tests\Feature\Ai\Security\Support\CompromisedLlmDriver;
use Tests\Feature\Ai\Security\Support\InjectionPayloadCatalog;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    Http::preventStrayRequests();
    Http::fake();

    config([
        'ai.tools.enabled' => true,
        'ai.tools.write_enabled' => false,
        'ai.tools.write_allow' => [],
        'ai.tools.allow' => [],
        'ai.tools.deny' => [],
    ]);
});

/**
 * @return array{status: string, pending_id: ?string, is_error: bool}
 */
function invokeSecuritySurface(
    string $surface,
    string $tool,
    array $arguments,
    User $actor,
): array {
    if ($surface === 'mcp') {
        $call = app(RegistryMcpToolAdapter::class)->callTool($tool, $arguments, $actor);
        $status = (string) ($call['structuredContent']['status'] ?? ($call['isError'] ? 'denied' : 'ok'));

        return [
            'status' => $status,
            'pending_id' => isset($call['structuredContent']['pending_id'])
                ? (string) $call['structuredContent']['pending_id']
                : null,
            'is_error' => (bool) $call['isError'],
        ];
    }

    $outcome = app(AiToolExecutorService::class)->execute(
        $tool,
        $arguments,
        $actor,
        [
            'surface' => 'chat',
            'include_write' => true,
        ],
    );

    return [
        'status' => $outcome->status,
        'pending_id' => $outcome->pendingId,
        'is_error' => ! $outcome->isOk() && ! $outcome->isPendingApproval(),
    ];
}

/**
 * Mutating / privileged tool calls must not land as a silent ok.
 */
function assertNotSilentSuccess(array $result, string $label): void
{
    expect($result['status'])
        ->not->toBe('ok', $label)
        ->and(in_array($result['status'], ['denied', 'pending_approval', 'invalid_args', 'disabled', 'not_found'], true))
        ->toBeTrue($label.' got unexpected status '.$result['status']);
}

it('blocks prompt-injection tool calls across ≥20 payloads × chat+MCP × 3+ roles with audit and no mutation', function (): void {
    expect(InjectionPayloadCatalog::count())->toBeGreaterThanOrEqual(20);

    $fixtures = AiSecurityFixture::seedCmsWithInjections();
    $actors = AiSecurityFixture::actors();
    $context = $fixtures['context'];

    $collectionsBefore = Collection::query()->count();
    $itemsBefore = CollectionItem::query()->count();
    $filesBefore = File::query()->count();
    $pendingBefore = PendingToolCall::query()->count();

    $roles = ['viewer', 'editor', 'admin', 'limited'];
    $surfaces = ['chat', 'mcp'];
    $combinations = 0;
    $auditedAttempts = 0;

    foreach ($roles as $role) {
        /** @var User $actor */
        $actor = $actors[$role];
        $this->actingAs($actor);

        foreach (array_keys(InjectionPayloadCatalog::all()) as $payloadId) {
            foreach ($surfaces as $surface) {
                $combinations++;
                $activityBefore = Activity::query()->inLog('ai')->forEvent('ai_tool')->count();

                foreach (CompromisedLlmDriver::toolCallsFor($payloadId, $context) as $call) {
                    $result = invokeSecuritySurface($surface, $call['tool'], $call['arguments'], $actor);
                    $label = sprintf('%s/%s/%s/%s', $role, $surface, $payloadId, $call['tool']);

                    // Compromised-model writes / escalations must never execute silently.
                    if (in_array($call['threat'], [
                        'unapproved_destructive_write',
                        'unapproved_write',
                        'data_exfiltration',
                        'ssrf_exfiltration',
                        'privilege_escalation',
                    ], true)) {
                        assertNotSilentSuccess($result, $label);

                        // Files-only actors never pass registry ability checks for these tools.
                        if ($role === 'limited') {
                            expect($result['status'])->toBe('denied', $label);
                        }

                        // Viewer has CanShowCollections, which satisfies ManageCollections /
                        // ManageCollectionItems canAny() — write kill switch still denies
                        // (or MCP may queue pending when the gate is open). Never ok.
                        if ($role === 'viewer' && in_array($call['tool'], [
                            'ManageUsers',
                            'ManageRoles',
                            'ManageGroups',
                            'ManageFiles',
                            'ImportRemoteJson',
                            'RollbackLastAiTurn',
                            'QueryActivityLogs',
                        ], true)) {
                            expect($result['status'])->toBe('denied', $label);
                        }
                    }

                    // Files-only token cannot use collection tools.
                    if ($role === 'limited' && in_array($call['tool'], [
                        'QueryCollectionItems',
                        'ExportCollection',
                        'SearchSimilarCollectionItems',
                        'ManageCollections',
                        'ManageCollectionItems',
                        'ImportRemoteJson',
                        'RollbackLastAiTurn',
                    ], true)) {
                        expect($result['status'])->toBe('denied', $label);
                    }

                    // Activity log tool requires CanShowActivityLogs.
                    if ($call['tool'] === 'QueryActivityLogs' && $role !== 'admin') {
                        expect($result['status'])->toBe('denied', $label);
                    }

                    $activityAfter = Activity::query()->inLog('ai')->forEvent('ai_tool')->count();
                    expect($activityAfter)->toBeGreaterThan($activityBefore, 'missing audit for '.$label);
                    $auditedAttempts++;
                    $activityBefore = $activityAfter;
                }
            }
        }
    }

    expect($combinations)->toBeGreaterThanOrEqual(20 * 2 * 3)
        ->and($auditedAttempts)->toBeGreaterThan(0)
        ->and(Collection::query()->count())->toBe($collectionsBefore)
        ->and(CollectionItem::query()->count())->toBe($itemsBefore)
        ->and(File::query()->count())->toBe($filesBefore)
        // Write kill switch off → no pending rows either.
        ->and(PendingToolCall::query()->count())->toBe($pendingBefore)
        ->and(Http::recorded())->toBeEmpty();
});

it('requires MCP human approval for allowlisted writes and still audits denied injection attempts', function (): void {
    config([
        'ai.tools.write_enabled' => true,
        'ai.tools.write_allow' => [
            'ManageCollections',
            'ManageCollectionItems',
            'ManageFiles',
            'ImportRemoteJson',
            'ManageUsers',
            'ManageRoles',
            'ManageGroups',
            'RollbackLastAiTurn',
        ],
    ]);

    $fixtures = AiSecurityFixture::seedCmsWithInjections();
    $actors = AiSecurityFixture::actors();
    $context = $fixtures['context'];
    $admin = $actors['admin'];
    $viewer = $actors['viewer'];

    $collectionsBefore = Collection::query()->count();
    $itemsBefore = CollectionItem::query()->count();

    // Viewer may pass ManageCollections ability via CanShowCollections (canAny), but MCP
    // must still require human approval — and a viewer approver cannot execute deletes.
    $this->actingAs($viewer);
    $viewerCall = CompromisedLlmDriver::toolCallsFor('ignore_prev_delete_collection', $context)[0];
    $viewerResult = invokeSecuritySurface('mcp', $viewerCall['tool'], $viewerCall['arguments'], $viewer);
    expect($viewerResult['status'])->toBe('pending_approval')
        ->and($viewerResult['pending_id'])->not->toBeNull();

    $viewerPending = PendingToolCall::query()->where('uuid', $viewerResult['pending_id'])->firstOrFail();
    $viewerApprove = app(AiToolExecutorService::class)->approveAndExecute($viewerPending, $viewer);
    // Registry canAny(show) lets the call run, but tool-level CanDeleteCollections blocks mutation.
    expect($viewerApprove->result ?? '')->toContain('Missing permission')
        ->and(Collection::query()->find($context['public_collection_id']))->not->toBeNull()
        ->and(Collection::query()->find($context['public_collection_id'])->trashed())->toBeFalse();

    // Privilege-escalation tools stay hard-denied for viewers even with the write gate open.
    $escalate = CompromisedLlmDriver::toolCallsFor('manage_users_escalate', $context)[0];
    expect(invokeSecuritySurface('mcp', $escalate['tool'], $escalate['arguments'], $viewer)['status'])
        ->toBe('denied');

    // Admin MCP mutating call queues approval — must not mutate yet.
    $this->actingAs($admin);
    $adminCall = CompromisedLlmDriver::toolCallsFor('ignore_prev_delete_collection', $context)[0];
    $adminResult = invokeSecuritySurface('mcp', $adminCall['tool'], $adminCall['arguments'], $admin);

    expect($adminResult['status'])->toBe('pending_approval')
        ->and($adminResult['pending_id'])->not->toBeNull()
        ->and(PendingToolCall::query()->where('uuid', $adminResult['pending_id'])->exists())->toBeTrue()
        ->and(Collection::query()->count())->toBe($collectionsBefore)
        ->and(CollectionItem::query()->count())->toBe($itemsBefore);

    // SSRF / exfil URL must not cause outbound HTTP even if somehow executed with skip_approval.
    $exfil = CompromisedLlmDriver::toolCallsFor('exfiltrate_metadata_ssrf', $context)[0];
    $pendingExfil = invokeSecuritySurface('mcp', $exfil['tool'], $exfil['arguments'], $admin);
    expect($pendingExfil['status'])->toBe('pending_approval');

    $forced = app(AiToolExecutorService::class)->execute(
        $exfil['tool'],
        $exfil['arguments'],
        $admin,
        [
            'surface' => 'chat',
            'include_write' => true,
            'skip_approval' => true,
        ],
    );

    // Tool-level SSRF guard returns an Error string (executor status may still be ok).
    expect($forced->result ?? $forced->message ?? '')->toContain('SSRF')
        ->and(Http::recorded())->toBeEmpty()
        ->and(Collection::query()->where('name', 'meta')->exists())->toBeFalse()
        ->and(Activity::query()->inLog('ai')->forEvent('ai_tool')->count())->toBeGreaterThan(0);
});

it('fails open AuthZ if registry ability checks are bypassed (mutation sanity)', function (): void {
    $fixtures = AiSecurityFixture::seedCmsWithInjections();
    $viewer = AiSecurityFixture::actors()['viewer'];
    $this->actingAs($viewer);

    $call = CompromisedLlmDriver::toolCallsFor('manage_users_escalate', $fixtures['context'])[0];
    $result = invokeSecuritySurface('chat', $call['tool'], $call['arguments'], $viewer);

    // If AiToolRegistryService::actorPassesAbilities were stubbed to always true,
    // write-disabled config would still deny — so also assert ability-sensitive read.
    $read = invokeSecuritySurface(
        'mcp',
        'QueryActivityLogs',
        ['limit' => 10],
        $viewer,
    );

    expect($result['status'])->toBe('denied')
        ->and($read['status'])->toBe('denied');

    // Ability check is what separates viewer from admin on QueryActivityLogs.
    $admin = AiSecurityFixture::actors()['admin'];
    $adminRead = invokeSecuritySurface('mcp', 'QueryActivityLogs', ['limit' => 10], $admin);
    expect($adminRead['status'])->toBe('ok');
});

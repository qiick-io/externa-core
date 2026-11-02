<?php

declare(strict_types=1);

use App\Ai\Agents\AppAssistant;
use App\Enums\PermissionEnum;
use App\Mcp\Adapters\RegistryMcpToolAdapter;
use App\Models\Collection;
use App\Models\User;
use App\Services\Ai\AiToolExecutorService;
use App\Services\Ai\AiToolRegistryService;
use Database\Seeders\PermissionSeeder;
use Laravel\Ai\Tools\ToolNameResolver;

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

it('lists the same read tools for chat and MCP for a show-collections user', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $registry = app(AiToolRegistryService::class);

    $readNames = collect($registry->visibleFor($user))
        ->map->name()
        ->sort()
        ->values()
        ->all();

    $mcpNames = collect(app(RegistryMcpToolAdapter::class)->listTools($user))
        ->pluck('name')
        ->sort()
        ->values()
        ->all();

    $chatNames = collect((new AppAssistant($user))->tools())
        ->map(fn ($tool): string => ToolNameResolver::resolve($tool))
        ->sort()
        ->values()
        ->all();

    expect($mcpNames)->toBe($readNames)
        ->and($chatNames)->toBe($readNames)
        ->and($readNames)->toContain('QueryCollectionItems')
        ->and($readNames)->toContain('ExportCollection')
        ->and($readNames)->toContain('SearchSimilarCollectionItems')
        ->and($readNames)->toContain('DescribeFieldTypes')
        ->and($readNames)->not->toContain('ManageCollections');
});

it('denies QueryCollectionItems on chat and MCP when the user lacks show collections', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->actingAs($user);

    $chatNames = collect((new AppAssistant($user))->tools())
        ->map(fn ($tool): string => ToolNameResolver::resolve($tool))
        ->all();

    $mcp = app(RegistryMcpToolAdapter::class);
    $mcpNames = collect($mcp->listTools($user))->pluck('name')->all();

    expect($chatNames)->not->toContain('QueryCollectionItems')
        ->and($mcpNames)->not->toContain('QueryCollectionItems');

    $collection = Collection::factory()->create();

    $chatCall = app(AiToolExecutorService::class)->execute(
        'QueryCollectionItems',
        ['collection_id' => $collection->id],
        $user,
    );

    $mcpCall = $mcp->callTool(
        'QueryCollectionItems',
        ['collection_id' => $collection->id],
        $user,
    );

    expect($chatCall->status)->toBe('denied')
        ->and($mcpCall['isError'])->toBeTrue()
        ->and($mcpCall['structuredContent']['status'] ?? null)->toBe('denied');
});

it('allows QueryCollectionItems on both surfaces when the user can show collections', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $args = ['collection_id' => $collection->id];

    $chatCall = app(AiToolExecutorService::class)->execute(
        'QueryCollectionItems',
        $args,
        $user,
    );

    $mcpCall = app(RegistryMcpToolAdapter::class)->callTool(
        'QueryCollectionItems',
        $args,
        $user,
    );

    expect($chatCall->status)->toBe('ok')
        ->and($mcpCall['isError'])->toBeFalse()
        ->and($mcpCall['structuredContent']['status'] ?? null)->toBe('ok');
});

it('hides mutating tools from chat and MCP until the write gate allows them', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);
    $this->actingAs($user);

    $chatNames = collect((new AppAssistant($user))->tools())
        ->map(fn ($tool): string => ToolNameResolver::resolve($tool))
        ->all();

    $mcpNames = collect(app(RegistryMcpToolAdapter::class)->listTools($user))
        ->pluck('name')
        ->all();

    expect($chatNames)->not->toContain('ManageCollections')
        ->and($mcpNames)->not->toContain('ManageCollections')
        ->and($mcpNames)->toContain('QueryCollectionItems');

    config([
        'ai.tools.write_enabled' => true,
        'ai.tools.write_allow' => ['ManageCollections'],
        // MCP adapter also requires the MCP write flag (#121).
        'ai.mcp.write_enabled' => true,
    ]);

    $chatEnabled = collect((new AppAssistant($user))->tools())
        ->map(fn ($tool): string => ToolNameResolver::resolve($tool))
        ->all();
    $mcpEnabled = collect(app(RegistryMcpToolAdapter::class)->listTools($user))
        ->pluck('name')
        ->all();

    expect($chatEnabled)->toContain('ManageCollections')
        ->and($mcpEnabled)->toContain('ManageCollections');
});

it('re-checks permissions at MCP call time even if the tool was previously listed', function (): void {
    $allowed = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);
    $denied = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $mcp = app(RegistryMcpToolAdapter::class);
    expect(collect($mcp->listTools($allowed))->pluck('name')->all())
        ->toContain('QueryCollectionItems')
        ->and(collect($mcp->listTools($denied))->pluck('name')->all())
        ->not->toContain('QueryCollectionItems');

    $collection = Collection::factory()->create();

    $this->actingAs($denied);
    $call = $mcp->callTool('QueryCollectionItems', ['collection_id' => $collection->id], $denied);

    expect($call['isError'])->toBeTrue()
        ->and($call['structuredContent']['status'] ?? null)->toBe('denied');
});

it('returns pending_approval for MCP mutating calls when the write gate allows the tool', function (): void {
    config([
        'ai.tools.write_enabled' => true,
        'ai.tools.write_allow' => ['ManageCollections'],
        'ai.mcp.write_enabled' => true,
    ]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);

    $call = app(RegistryMcpToolAdapter::class)->callTool(
        'ManageCollections',
        ['action' => 'list'],
        $user,
    );

    expect($call['isError'])->toBeFalse()
        ->and($call['structuredContent']['status'] ?? null)->toBe('pending_approval')
        ->and($call['structuredContent']['pending_id'] ?? null)->not->toBeNull();
});

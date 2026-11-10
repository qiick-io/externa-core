<?php

declare(strict_types=1);

use App\Ai\Registry\LaravelAiToolDefinition;
use App\Contracts\Ai\ToolDefinitionContract;
use App\Enums\AiToolKindEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\User;
use App\Services\Ai\AiToolRegistryService;
use Database\Seeders\PermissionSeeder;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Ai\Approvals\Approval;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;

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

it('registers default AppAssistant tools by stable name', function (): void {
    $registry = app(AiToolRegistryService::class);
    $names = collect($registry->all())->map->name()->sort()->values()->all();

    expect($names)->toContain('QueryCollectionItems')
        ->and($names)->toContain('ManageCollections')
        ->and($names)->toContain('ManageFiles')
        ->and($names)->toContain('QueryActivityLogs');
});

it('hides write and destructive tools unless the write gate allows them', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);

    $registry = app(AiToolRegistryService::class);

    $defaultVisible = collect($registry->visibleFor($user))
        ->map->name()
        ->all();

    expect($defaultVisible)->toContain('QueryCollectionItems')
        ->and($defaultVisible)->toContain('DescribeFieldTypes')
        ->and($defaultVisible)->not->toContain('ManageCollections')
        ->and($defaultVisible)->not->toContain('ImportCollectionCsv');

    // include_write cannot bypass the kill switch / empty allowlist.
    expect(collect($registry->visibleFor($user, ['include_write' => true]))->map->name()->all())
        ->not->toContain('ManageCollections');

    config([
        'ai.tools.write_enabled' => true,
        'ai.tools.write_allow' => ['ManageCollections', 'ImportCollectionCsv'],
    ]);

    $enabledVisible = collect($registry->visibleFor($user))
        ->map->name()
        ->all();

    expect($enabledVisible)->toContain('ManageCollections')
        ->and($enabledVisible)->toContain('ImportCollectionCsv')
        ->and($enabledVisible)->not->toContain('ManageFiles');
});

it('respects per-tool deny and allow lists', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);

    config([
        'ai.tools.deny' => ['QueryCollectionItems'],
        'ai.tools.allow' => [],
    ]);

    $registry = app(AiToolRegistryService::class);

    expect(collect($registry->visibleFor($user))->map->name()->all())
        ->not->toContain('QueryCollectionItems');

    config([
        'ai.tools.deny' => [],
        'ai.tools.allow' => ['ExportCollection'],
    ]);

    $allowed = collect($registry->visibleFor($user))->map->name()->all();

    expect($allowed)->toBe(['ExportCollection']);
});

it('does not advertise tools the actor cannot use', function (): void {
    config([
        'ai.tools.write_enabled' => true,
        'ai.tools.write_allow' => ['ManageFiles'],
    ]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowFiles->value,
    ]);

    $registry = app(AiToolRegistryService::class);
    $names = collect($registry->visibleFor($user))
        ->map->name()
        ->all();

    expect($names)->toContain('ManageFiles')
        ->and($names)->not->toContain('QueryCollectionItems')
        ->and($names)->not->toContain('ManageUsers');
});

it('allows packages to register additional definitions', function (): void {
    $registry = app(AiToolRegistryService::class);

    $registry->register(new class implements ToolDefinitionContract
    {
        public function name(): string
        {
            return 'PackageEcho';
        }

        public function description(): string
        {
            return 'Echo for package extension.';
        }

        public function inputSchema(): array
        {
            return [
                'type' => 'object',
                'properties' => (object) [
                    'message' => ['type' => 'string'],
                ],
                'required' => ['message'],
            ];
        }

        public function kind(): AiToolKindEnum
        {
            return AiToolKindEnum::Read;
        }

        public function requiredAbilities(): callable
        {
            return fn (?Authenticatable $actor, array $_args = []): bool => $actor !== null;
        }

        public function handle(array $arguments): string
        {
            return (string) ($arguments['message'] ?? '');
        }
    });

    $user = User::factory()->create();

    expect($registry->get('PackageEcho'))->not->toBeNull()
        ->and(collect($registry->visibleFor($user))->map->name()->all())
        ->toContain('PackageEcho');
});

it('chatToolsFor unwraps LaravelAiToolDefinition instances', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);

    $tools = app(AiToolRegistryService::class)->chatToolsFor($user);
    $basenames = collect($tools)->map(fn ($tool): string => class_basename($tool))->all();

    expect($basenames)->toContain('QueryCollectionItems')
        ->and($basenames)->toContain('ManageCollections')
        ->and(collect($tools)->every(fn ($tool) => $tool instanceof Tool))->toBeTrue();

    $definition = app(AiToolRegistryService::class)->get('QueryCollectionItems');
    expect($definition)->toBeInstanceOf(LaravelAiToolDefinition::class);
});

it('keeps chat read actions of mixed tools while the write gate denies their writes', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->actingAs($user);
    $collection = Collection::factory()->create(['name' => 'Chat readable']);

    $registry = app(AiToolRegistryService::class);
    $chatTools = collect($registry->chatToolsFor($user))->keyBy(fn ($tool): string => class_basename($tool));

    expect($chatTools->keys()->all())->toContain('ManageCollections', 'ManageCollectionItems', 'ManageFiles');

    $manageCollections = $chatTools['ManageCollections'];
    $listResult = (string) $manageCollections->handle(new Request(['action' => 'list']));
    $createResult = (string) $manageCollections->handle(new Request(['action' => 'create', 'name' => 'Sneaky']));

    expect($listResult)->toContain('Chat readable')
        ->and($createResult)->toStartWith('Error: ManageCollections create is disabled')
        ->and(Collection::query()->where('name', 'Sneaky')->exists())->toBeFalse()
        ->and($collection->fresh())->not->toBeNull()
        ->and((string) $chatTools['ManageCollectionItems']->handle(new Request(['action' => 'publish', 'item_id' => 1])))
        ->toStartWith('Error: ManageCollectionItems publish is disabled')
        ->and((string) $chatTools['ManageFiles']->handle(new Request(['action' => 'tag', 'file_id' => 1, 'tags_json' => '["x"]'])))
        ->toStartWith('Error: ManageFiles tag is disabled');

    // The registry's shared instance is not switched to read-only (MCP / executor keep their own gates).
    $sharedTool = $registry->get('ManageCollections');
    expect($sharedTool)->toBeInstanceOf(LaravelAiToolDefinition::class)
        ->and($sharedTool->laravelTool()->shouldRequestApproval(new Request(['action' => 'create'])))
        ->toBeInstanceOf(Approval::class);

    config(['ai.tools.deny' => ['ManageCollections']]);

    expect(collect($registry->chatToolsFor($user))->map(fn ($tool): string => class_basename($tool))->all())
        ->not->toContain('ManageCollections');
});

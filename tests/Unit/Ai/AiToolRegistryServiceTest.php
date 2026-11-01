<?php

declare(strict_types=1);

use App\Ai\Registry\LaravelAiToolDefinition;
use App\Contracts\Ai\ToolDefinitionInterface;
use App\Enums\AiToolKindEnum;
use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Ai\AiToolRegistryService;
use Database\Seeders\PermissionSeeder;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Ai\Contracts\Tool;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
});

it('registers default AppAssistant tools by stable name', function (): void {
    $registry = app(AiToolRegistryService::class);
    $names = collect($registry->all())->map->name()->sort()->values()->all();

    expect($names)->toContain('QueryCollectionItems')
        ->and($names)->toContain('ManageCollections')
        ->and($names)->toContain('ManageFiles')
        ->and($names)->toContain('QueryActivityLogs');
});

it('hides write and destructive tools unless write_enabled or include_write', function (): void {
    config([
        'ai.tools.enabled' => true,
        'ai.tools.write_enabled' => false,
        'ai.tools.allow' => [],
        'ai.tools.deny' => [],
    ]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);

    $registry = app(AiToolRegistryService::class);

    $mcpVisible = collect($registry->visibleFor($user))
        ->map->name()
        ->all();

    expect($mcpVisible)->toContain('QueryCollectionItems')
        ->and($mcpVisible)->toContain('DescribeFieldTypes')
        ->and($mcpVisible)->not->toContain('ManageCollections')
        ->and($mcpVisible)->not->toContain('ImportCollectionCsv');

    $chatVisible = collect($registry->visibleFor($user, ['include_write' => true]))
        ->map->name()
        ->all();

    expect($chatVisible)->toContain('ManageCollections')
        ->and($chatVisible)->toContain('ImportCollectionCsv');
});

it('respects per-tool deny and allow lists', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);

    config([
        'ai.tools.enabled' => true,
        'ai.tools.write_enabled' => false,
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
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowFiles->value,
    ]);

    $registry = app(AiToolRegistryService::class);
    $names = collect($registry->visibleFor($user, ['include_write' => true]))
        ->map->name()
        ->all();

    expect($names)->toContain('ManageFiles')
        ->and($names)->not->toContain('QueryCollectionItems')
        ->and($names)->not->toContain('ManageUsers');
});

it('allows packages to register additional definitions', function (): void {
    $registry = app(AiToolRegistryService::class);

    $registry->register(new class implements ToolDefinitionInterface
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
        ->and(collect($tools)->every(fn ($tool) => $tool instanceof Tool))->toBeTrue();

    $definition = app(AiToolRegistryService::class)->get('QueryCollectionItems');
    expect($definition)->toBeInstanceOf(LaravelAiToolDefinition::class);
});

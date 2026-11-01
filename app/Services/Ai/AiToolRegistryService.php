<?php

declare(strict_types=1);

namespace App\Services\Ai;

use App\Ai\Registry\LaravelAiToolDefinition;
use App\Ai\Tools\DescribeFieldTypes;
use App\Ai\Tools\ExportCollection;
use App\Ai\Tools\ExtractPdfText;
use App\Ai\Tools\GetImportJobStatus;
use App\Ai\Tools\ImportCollectionCsv;
use App\Ai\Tools\ImportRemoteJson;
use App\Ai\Tools\ManageAiSyncSources;
use App\Ai\Tools\ManageCollectionItems;
use App\Ai\Tools\ManageCollections;
use App\Ai\Tools\ManageFiles;
use App\Ai\Tools\ManageGroups;
use App\Ai\Tools\ManageRoles;
use App\Ai\Tools\ManageUsers;
use App\Ai\Tools\QueryActivityLogs;
use App\Ai\Tools\QueryCollectionItems;
use App\Ai\Tools\RollbackLastAiTurn;
use App\Ai\Tools\SearchSimilarCollectionItems;
use App\Contracts\Ai\ToolDefinitionInterface;
use App\Enums\AiToolKindEnum;
use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolverService;
use Illuminate\Contracts\Auth\Authenticatable;
use Laravel\Ai\Contracts\Tool;
use RuntimeException;

/**
 * Shared permission-aware catalog of AI / MCP tools.
 *
 * Packages may call {@see register()} to extend the catalog.
 */
class AiToolRegistryService
{
    /** @var array<string, ToolDefinitionInterface> */
    private array $definitions = [];

    private bool $defaultsRegistered = false;

    public function __construct(
        private readonly EffectivePermissionResolverService $permissionResolver,
        private readonly AiToolWriteGateService $writeGate,
    ) {}

    /**
     * Register (or replace) a tool definition by name.
     */
    public function register(ToolDefinitionInterface $definition): void
    {
        $this->definitions[$definition->name()] = $definition;
    }

    /**
     * Ensure built-in AppAssistant tools are registered (idempotent).
     */
    public function registerDefaults(): void
    {
        if ($this->defaultsRegistered) {
            return;
        }

        $this->defaultsRegistered = true;

        foreach ($this->defaultDefinitions() as $definition) {
            $this->register($definition);
        }
    }

    /**
     * @return list<ToolDefinitionInterface>
     */
    public function all(): array
    {
        $this->registerDefaults();

        return array_values($this->definitions);
    }

    public function get(string $name): ?ToolDefinitionInterface
    {
        $this->registerDefaults();

        return $this->definitions[$name] ?? null;
    }

    /**
     * Tools the actor may see (config + abilities + write gate).
     *
     * @param  array{include_write?: bool, arguments?: array<string, mixed>}  $options
     * @return list<ToolDefinitionInterface>
     */
    public function visibleFor(?Authenticatable $actor, array $options = []): array
    {
        $this->registerDefaults();

        if (! (bool) config('ai.tools.enabled', true)) {
            return [];
        }

        $includeWrite = (bool) ($options['include_write'] ?? false);
        $arguments = is_array($options['arguments'] ?? null) ? $options['arguments'] : [];

        $visible = [];

        foreach ($this->definitions as $definition) {
            if (! $this->passesConfigGates($definition, $includeWrite ? true : null)) {
                continue;
            }

            if (! $this->actorPassesAbilities($definition, $actor, $arguments)) {
                continue;
            }

            $visible[] = $definition;
        }

        return $visible;
    }

    /**
     * laravel/ai Tool instances for AppAssistant (mutating tools only when write gate allows).
     *
     * @return list<Tool>
     */
    public function chatToolsFor(?Authenticatable $actor): array
    {
        $tools = [];

        foreach ($this->visibleFor($actor, ['include_write' => true]) as $definition) {
            if ($definition instanceof LaravelAiToolDefinition) {
                $tools[] = $definition->laravelTool();

                continue;
            }

            throw new RuntimeException(sprintf(
                'Chat adapter requires LaravelAiToolDefinition; got %s for tool [%s].',
                $definition::class,
                $definition->name(),
            ));
        }

        return $tools;
    }

    /**
     * Whether a definition is allowed by config (enabled, allow/deny, write gate).
     *
     * @param  bool|null  $writeEnabled  When true, still requires per-tool allowlist via {@see AiToolWriteGateService}.
     *                                   When null, uses the env kill switch + allowlist. When false, denies mutating tools.
     */
    public function passesConfigGates(ToolDefinitionInterface $definition, ?bool $writeEnabled = null): bool
    {
        if (! (bool) config('ai.tools.enabled', true)) {
            return false;
        }

        $name = $definition->name();
        $allow = $this->normalizedNameList(config('ai.tools.allow', []));
        $deny = $this->normalizedNameList(config('ai.tools.deny', []));

        if ($deny !== [] && in_array($name, $deny, true)) {
            return false;
        }

        if ($allow !== [] && ! in_array($name, $allow, true)) {
            return false;
        }

        if (! $definition->kind()->isMutating()) {
            return true;
        }

        if ($writeEnabled === false) {
            return false;
        }

        // include_write / writeEnabled=true still cannot bypass the env kill switch or empty allowlist.
        if ($writeEnabled === true && ! $this->writeGate->isWriteEnabled()) {
            return false;
        }

        return $this->writeGate->isToolWriteAllowed($name);
    }

    /**
     * @param  array<string, mixed>  $arguments
     */
    public function actorPassesAbilities(
        ToolDefinitionInterface $definition,
        ?Authenticatable $actor,
        array $arguments = [],
    ): bool {
        $callback = $definition->requiredAbilities();

        return (bool) $callback($actor, $arguments);
    }

    /**
     * @return list<LaravelAiToolDefinition>
     */
    private function defaultDefinitions(): array
    {
        $canAny = fn (?Authenticatable $actor, array $permissions): bool => $this->userCanAny($actor, $permissions);
        $can = fn (?Authenticatable $actor, PermissionEnum $permission): bool => $this->userHas($actor, $permission);

        $collectionManage = [
            PermissionEnum::CanShowCollections,
            PermissionEnum::CanCreateCollections,
            PermissionEnum::CanEditCollections,
            PermissionEnum::CanDeleteCollections,
            PermissionEnum::CanRestoreCollections,
            PermissionEnum::CanForceDeleteCollections,
        ];

        $fileManage = [
            PermissionEnum::CanShowFiles,
            PermissionEnum::CanCreateFiles,
            PermissionEnum::CanEditFiles,
            PermissionEnum::CanDeleteFiles,
            PermissionEnum::CanRestoreFiles,
            PermissionEnum::CanForceDeleteFiles,
        ];

        $userManage = [
            PermissionEnum::CanShowUsers,
            PermissionEnum::CanCreateUsers,
            PermissionEnum::CanEditUsers,
            PermissionEnum::CanDeleteUsers,
            PermissionEnum::CanRestoreUsers,
            PermissionEnum::CanForceDeleteUsers,
        ];

        $roleManage = [
            PermissionEnum::CanShowRoles,
            PermissionEnum::CanCreateRoles,
            PermissionEnum::CanEditRoles,
            PermissionEnum::CanDeleteRoles,
        ];

        $groupManage = [
            PermissionEnum::CanShowGroups,
            PermissionEnum::CanCreateGroups,
            PermissionEnum::CanEditGroups,
            PermissionEnum::CanDeleteGroups,
            PermissionEnum::CanRestoreGroups,
            PermissionEnum::CanForceDeleteGroups,
        ];

        return [
            new LaravelAiToolDefinition(
                new ManageCollections,
                AiToolKindEnum::Destructive,
                fn (?Authenticatable $actor, array $_args = []): bool => $canAny($actor, $collectionManage),
            ),
            new LaravelAiToolDefinition(
                new ManageCollectionItems,
                AiToolKindEnum::Destructive,
                fn (?Authenticatable $actor, array $_args = []): bool => $canAny($actor, $collectionManage),
            ),
            new LaravelAiToolDefinition(
                new DescribeFieldTypes,
                AiToolKindEnum::Read,
                fn (?Authenticatable $actor, array $_args = []): bool => $canAny($actor, $collectionManage),
            ),
            new LaravelAiToolDefinition(
                new ImportCollectionCsv,
                AiToolKindEnum::Write,
                fn (?Authenticatable $actor, array $_args = []): bool => $can($actor, PermissionEnum::CanCreateCollections),
            ),
            new LaravelAiToolDefinition(
                new ImportRemoteJson,
                AiToolKindEnum::Write,
                fn (?Authenticatable $actor, array $_args = []): bool => $can($actor, PermissionEnum::CanCreateCollections),
            ),
            new LaravelAiToolDefinition(
                new ExtractPdfText,
                AiToolKindEnum::Read,
                fn (?Authenticatable $actor, array $_args = []): bool => $can($actor, PermissionEnum::CanCreateCollections),
            ),
            new LaravelAiToolDefinition(
                new GetImportJobStatus,
                AiToolKindEnum::Read,
                fn (?Authenticatable $actor, array $_args = []): bool => $can($actor, PermissionEnum::CanCreateCollections),
            ),
            new LaravelAiToolDefinition(
                new ManageAiSyncSources,
                AiToolKindEnum::Destructive,
                fn (?Authenticatable $actor, array $_args = []): bool => $can($actor, PermissionEnum::CanCreateCollections),
            ),
            new LaravelAiToolDefinition(
                new QueryCollectionItems,
                AiToolKindEnum::Read,
                fn (?Authenticatable $actor, array $_args = []): bool => $can($actor, PermissionEnum::CanShowCollections),
            ),
            new LaravelAiToolDefinition(
                new ExportCollection,
                AiToolKindEnum::Read,
                fn (?Authenticatable $actor, array $_args = []): bool => $can($actor, PermissionEnum::CanShowCollections),
            ),
            new LaravelAiToolDefinition(
                new SearchSimilarCollectionItems,
                AiToolKindEnum::Read,
                fn (?Authenticatable $actor, array $_args = []): bool => $can($actor, PermissionEnum::CanShowCollections),
            ),
            new LaravelAiToolDefinition(
                new RollbackLastAiTurn,
                AiToolKindEnum::Destructive,
                fn (?Authenticatable $actor, array $_args = []): bool => $can($actor, PermissionEnum::CanDeleteCollections),
            ),
            new LaravelAiToolDefinition(
                new ManageFiles,
                AiToolKindEnum::Destructive,
                fn (?Authenticatable $actor, array $_args = []): bool => $canAny($actor, $fileManage),
            ),
            new LaravelAiToolDefinition(
                new ManageUsers,
                AiToolKindEnum::Destructive,
                fn (?Authenticatable $actor, array $_args = []): bool => $canAny($actor, $userManage),
            ),
            new LaravelAiToolDefinition(
                new ManageRoles,
                AiToolKindEnum::Destructive,
                fn (?Authenticatable $actor, array $_args = []): bool => $canAny($actor, $roleManage),
            ),
            new LaravelAiToolDefinition(
                new ManageGroups,
                AiToolKindEnum::Destructive,
                fn (?Authenticatable $actor, array $_args = []): bool => $canAny($actor, $groupManage),
            ),
            new LaravelAiToolDefinition(
                new QueryActivityLogs,
                AiToolKindEnum::Read,
                fn (?Authenticatable $actor, array $_args = []): bool => $can($actor, PermissionEnum::CanShowActivityLogs),
            ),
        ];
    }

    /**
     * @param  list<PermissionEnum>  $permissions
     */
    private function userCanAny(?Authenticatable $actor, array $permissions): bool
    {
        if (! $actor instanceof User) {
            return false;
        }

        foreach ($permissions as $permission) {
            if ($this->permissionResolver->hasPermission($actor, $permission->value)) {
                return true;
            }
        }

        return false;
    }

    private function userHas(?Authenticatable $actor, PermissionEnum $permission): bool
    {
        if (! $actor instanceof User) {
            return false;
        }

        return $this->permissionResolver->hasPermission($actor, $permission->value);
    }

    /**
     * @return list<string>
     */
    private function normalizedNameList(mixed $value): array
    {
        if (is_string($value)) {
            $value = explode(',', $value);
        }

        if (! is_array($value)) {
            return [];
        }

        $names = [];

        foreach ($value as $item) {
            if (! is_string($item)) {
                continue;
            }

            $trimmed = trim($item);

            if ($trimmed !== '') {
                $names[] = $trimmed;
            }
        }

        return array_values(array_unique($names));
    }
}

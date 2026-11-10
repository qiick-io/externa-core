<?php

declare(strict_types=1);

namespace App\Mcp\Tools\Concerns;

use App\Ai\Concerns\EnforcesAiCollectionPermissionsTrait;
use App\Ai\Concerns\EnforcesAiFileAccessTrait;
use App\Ai\Support\AiActivityLogger;
use App\Ai\Tools\ManageCollectionItems;
use App\Ai\Tools\ManageCollections;
use App\Ai\Tools\ManageFiles;
use App\Ai\Tools\QueryCollectionItems;
use App\Ai\Tools\SearchSimilarCollectionItems;
use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FilePermissionActionEnum;
use App\Mcp\Adapters\RegistryMcpToolAdapter;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use Laravel\Ai\Contracts\Tool as LaravelAiTool;
use Laravel\Ai\Tools\Request as AiToolRequest;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\ResponseFactory;

/**
 * Thin MCP tool → shared AI registry / AppAssistant tools (AuthZ + audit, surface=mcp).
 *
 * Multi-action Manage* tools are registered as Destructive in the shared catalog, so
 * read-only MCP wrappers invoke them directly (still inside the tool's permission
 * checks) when {@see usesExecutor()} is false. Write wrappers use the executor so
 * approval + write gates apply.
 */
trait DelegatesToRegistryMcpToolTrait
{
    use EnforcesAiCollectionPermissionsTrait;
    use EnforcesAiFileAccessTrait;

    /**
     * Registry / AppAssistant tool class basename (e.g. QueryCollectionItems).
     */
    abstract protected function registryToolName(): string;

    /**
     * Map MCP arguments onto the underlying tool's input shape.
     *
     * @param  array<string, mixed>  $arguments
     * @return array<string, mixed>
     */
    protected function mapArguments(array $arguments): array
    {
        return $arguments;
    }

    /**
     * Whether this MCP tool may appear when AI_MCP_WRITE_ENABLED is off.
     */
    protected function isWriteTool(): bool
    {
        return false;
    }

    /**
     * When true, route through {@see RegistryMcpToolAdapter} (write gate + approval).
     * Read wrappers over Manage* tools set this to false.
     */
    protected function usesExecutor(): bool
    {
        return $this->isWriteTool();
    }

    public function shouldRegister(): bool
    {
        if ($this->isWriteTool() && ! (bool) config('ai.mcp.write_enabled', false)) {
            return false;
        }

        if ($this->isWriteTool() && request()->attributes->get('mcp_can_write') === false) {
            return false;
        }

        return true;
    }

    public function handle(Request $request): Response|ResponseFactory
    {
        if ($this->isWriteTool()) {
            if (! (bool) config('ai.mcp.write_enabled', false)) {
                return Response::error('MCP write tools are disabled.');
            }

            if (request()->attributes->get('mcp_can_write') === false) {
                return Response::error('API key lacks mcp:write scope (or is read_only).');
            }
        }

        $actor = auth()->user();
        $actor = $actor instanceof Authenticatable ? $actor : null;
        $arguments = $this->mapArguments($request->all());

        if ($this->usesExecutor()) {
            if ($error = $this->requestScopedWriteError($arguments)) {
                return Response::error($error);
            }

            return $this->handleViaExecutor($arguments, $actor);
        }

        return $this->handleViaDirectTool($arguments, $actor);
    }

    /**
     * Authorize an API-key write against the key's scope before the executor may park it
     * for approval: collection Update/Create + item_filter, or file Update (role ACL,
     * `collection_slugs`, `files_scope`, owner ceiling). Session callers return null; the
     * tool re-checks their permissions when it runs.
     *
     * ponytail: an approved pending call re-runs later as the key owner (approver ceiling)
     * without the key's `apiAccess`, so key scopes are enforced here, at request time.
     * Upgrade path: persist `api_key_id` on `pending_tool_calls` and rebuild ApiAccess on approval.
     *
     * @param  array<string, mixed>  $arguments
     */
    private function requestScopedWriteError(array $arguments): ?string
    {
        if ($this->aiRequestApiAccess() === null) {
            return null;
        }

        if ($this->registryToolName() === 'ManageFiles') {
            return $this->guardAiFileAction(FilePermissionActionEnum::Update);
        }

        if (isset($arguments['item_id'])) {
            $item = CollectionItem::query()->with('collection')->find((int) $arguments['item_id']);
            $collection = $item?->collection;

            if ($item === null || $collection === null) {
                return 'Error: Item not found.';
            }

            return $this->guardAiCollectionAction($collection, CollectionPermissionActionEnum::Update)
                ?? $this->guardAiItemWritable($collection, $item);
        }

        $collection = Collection::query()->find((int) ($arguments['collection_id'] ?? 0));

        if ($collection === null) {
            return 'Error: Collection not found.';
        }

        return $this->guardAiCollectionAction($collection, CollectionPermissionActionEnum::Create);
    }

    /**
     * @param  array<string, mixed>  $arguments
     */
    private function handleViaExecutor(array $arguments, ?Authenticatable $actor): Response|ResponseFactory
    {
        $payload = app(RegistryMcpToolAdapter::class)->callTool(
            $this->registryToolName(),
            $arguments,
            $actor,
        );

        $text = $payload['content'][0]['text'] ?? ($payload['isError'] ? 'Tool call failed.' : 'OK');

        if ($payload['isError']) {
            return Response::error(is_string($text) ? $text : 'Tool call failed.');
        }

        $structured = $payload['structuredContent'] ?? null;

        if (is_array($structured) && $structured !== []) {
            return Response::structured($structured);
        }

        return Response::text(is_string($text) ? $text : (json_encode($text) ?: ''));
    }

    /**
     * @param  array<string, mixed>  $arguments
     */
    private function handleViaDirectTool(array $arguments, ?Authenticatable $actor): Response|ResponseFactory
    {
        $tool = $this->resolveLaravelAiTool();
        $result = (string) $tool->handle(new AiToolRequest($arguments));
        $failed = str_starts_with($result, 'Error:');

        if ($actor instanceof User) {
            AiActivityLogger::toolDecision(
                actor: $actor,
                tool: $this->name(),
                arguments: $arguments,
                decision: $failed ? 'denied' : 'executed',
                status: $failed ? 'denied' : 'ok',
                surface: 'mcp',
                result: $result,
            );
        }

        if ($failed) {
            return Response::error($result);
        }

        return Response::text($result);
    }

    private function resolveLaravelAiTool(): LaravelAiTool
    {
        $class = match ($this->registryToolName()) {
            'ManageCollections' => ManageCollections::class,
            'ManageCollectionItems' => ManageCollectionItems::class,
            'ManageFiles' => ManageFiles::class,
            'QueryCollectionItems' => QueryCollectionItems::class,
            'SearchSimilarCollectionItems' => SearchSimilarCollectionItems::class,
            default => throw new \RuntimeException('Unknown registry tool ['.$this->registryToolName().'].'),
        };

        $tool = app($class);

        if (! $tool instanceof LaravelAiTool) {
            throw new \RuntimeException('Resolved tool is not a laravel/ai Tool.');
        }

        return $tool;
    }
}

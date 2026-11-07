<?php

declare(strict_types=1);

namespace App\Mcp\Adapters;

use App\Contracts\Ai\ToolDefinitionInterface;
use App\Services\Ai\AiToolExecutorService;
use App\Services\Ai\AiToolRegistryService;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * MVP bridge from the shared AI tool registry to MCP tools/list and tools/call shapes.
 *
 * Full MCP server transport lives in #121; this adapter is the AuthZ-safe mapping layer.
 */
final class RegistryMcpToolAdapter
{
    public function __construct(
        private readonly AiToolRegistryService $registry,
        private readonly AiToolExecutorService $executor,
    ) {}

    /**
     * MCP `tools/list` entries visible to the actor (mutating tools only when write gate allows).
     *
     * @return list<array{
     *     name: string,
     *     description: string,
     *     inputSchema: array<string, mixed>,
     *     annotations: array{readOnlyHint: bool, destructiveHint: bool}
     * }>
     */
    public function listTools(?Authenticatable $actor): array
    {
        $definitions = $this->registry->visibleFor($actor);

        if (! (bool) config('ai.mcp.write_enabled', false)) {
            $definitions = array_values(array_filter(
                $definitions,
                static fn (ToolDefinitionInterface $definition): bool => ! $definition->kind()->isMutating(),
            ));
        }

        return array_map(
            fn (ToolDefinitionInterface $definition): array => $this->toMcpTool($definition),
            $definitions,
        );
    }

    /**
     * MCP `tools/call` via the shared executor (permissions re-checked at call time).
     *
     * Always routes through {@see AiToolExecutorService} so every decision writes an
     * `ai_tool` audit row (same as chat). Write policy uses the shared kill switch /
     * allowlist; mutating calls return `pending_approval` when the write gate allows.
     * {@see listTools()} and HTTP MCP registration still honor `ai.mcp.write_enabled`.
     *
     * @param  array<string, mixed>  $arguments
     * @return array{
     *     isError: bool,
     *     content: list<array{type: string, text: string}>,
     *     structuredContent: array<string, mixed>
     * }
     */
    public function callTool(string $name, array $arguments, ?Authenticatable $actor): array
    {
        $outcome = $this->executor->execute($name, $arguments, $actor, [
            'surface' => 'mcp',
        ]);

        if ($outcome->isPendingApproval()) {
            $payload = $outcome->toArray();

            return [
                'isError' => false,
                'content' => [
                    [
                        'type' => 'text',
                        'text' => $outcome->message ?? 'Tool call awaiting human approval.',
                    ],
                ],
                'structuredContent' => $payload,
            ];
        }

        if (! $outcome->isOk()) {
            $payload = $outcome->toArray();

            return [
                'isError' => true,
                'content' => [
                    [
                        'type' => 'text',
                        'text' => $outcome->message ?? $outcome->status,
                    ],
                ],
                'structuredContent' => $payload,
            ];
        }

        $text = $outcome->result ?? '';

        return [
            'isError' => false,
            'content' => [
                [
                    'type' => 'text',
                    'text' => $text,
                ],
            ],
            'structuredContent' => [
                'status' => 'ok',
                'result' => $text,
            ],
        ];
    }

    /**
     * @return array{
     *     name: string,
     *     description: string,
     *     inputSchema: array<string, mixed>,
     *     annotations: array{readOnlyHint: bool, destructiveHint: bool}
     * }
     */
    private function toMcpTool(ToolDefinitionInterface $definition): array
    {
        $kind = $definition->kind();

        return [
            'name' => $definition->name(),
            'description' => $definition->description(),
            'inputSchema' => $definition->inputSchema(),
            'annotations' => [
                'readOnlyHint' => ! $kind->isMutating(),
                'destructiveHint' => $kind->value === 'destructive',
            ],
        ];
    }
}

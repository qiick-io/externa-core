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
     * MCP `tools/list` entries visible to the actor (write tools only when write_enabled).
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
        return array_map(
            fn (ToolDefinitionInterface $definition): array => $this->toMcpTool($definition),
            $this->registry->visibleFor($actor, ['include_write' => false]),
        );
    }

    /**
     * MCP `tools/call` via the shared executor (permissions re-checked at call time).
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
            'include_write' => false,
        ]);

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

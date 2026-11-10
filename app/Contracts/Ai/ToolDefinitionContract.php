<?php

declare(strict_types=1);

namespace App\Contracts\Ai;

use App\Enums\AiToolKindEnum;
use Illuminate\Contracts\Auth\Authenticatable;
use Stringable;

/**
 * Single source of truth for an AI / MCP tool: metadata, AuthZ callback, and handler.
 */
interface ToolDefinitionContract
{
    /**
     * Stable tool name (matches laravel/ai ToolNameResolver / MCP tools/list).
     */
    public function name(): string;

    /**
     * Human description shown to models and MCP clients.
     */
    public function description(): string;

    /**
     * JSON Schema object for tool arguments (`type` => object + properties).
     *
     * @return array<string, mixed>
     */
    public function inputSchema(): array;

    /**
     * Risk kind used for write-tool gating.
     */
    public function kind(): AiToolKindEnum;

    /**
     * Callback evaluated against the actor and arguments (list + call time).
     *
     * @return callable(Authenticatable|null, array<string, mixed>): bool
     */
    public function requiredAbilities(): callable;

    /**
     * Execute the tool with validated arguments.
     *
     * @param  array<string, mixed>  $arguments
     */
    public function handle(array $arguments): Stringable|string;
}

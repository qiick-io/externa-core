<?php

declare(strict_types=1);

namespace App\Ai\Registry;

use App\Contracts\Ai\ToolDefinitionContract;
use App\Enums\AiToolKindEnum;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\JsonSchema\JsonSchema as JsonSchemaFactory;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Laravel\Ai\Tools\ToolNameResolver;
use Stringable;

/**
 * Adapts an existing laravel/ai Tool into the shared ToolDefinitionContract.
 */
final class LaravelAiToolDefinition implements ToolDefinitionContract
{
    /**
     * @param  callable(Authenticatable|null, array<string, mixed>): bool  $requiredAbilities
     */
    public function __construct(
        private readonly Tool $tool,
        private readonly AiToolKindEnum $kind,
        private readonly mixed $requiredAbilities,
    ) {}

    public function name(): string
    {
        return ToolNameResolver::resolve($this->tool);
    }

    public function description(): string
    {
        return (string) $this->tool->description();
    }

    /**
     * @return array<string, mixed>
     */
    public function inputSchema(): array
    {
        $schema = JsonSchemaFactory::object(
            $this->tool->schema(...),
        )->toArray();

        $schema['properties'] ??= (object) [];

        return $schema;
    }

    public function kind(): AiToolKindEnum
    {
        return $this->kind;
    }

    /**
     * @return callable(Authenticatable|null, array<string, mixed>): bool
     */
    public function requiredAbilities(): callable
    {
        return $this->requiredAbilities;
    }

    /**
     * @param  array<string, mixed>  $arguments
     */
    public function handle(array $arguments): Stringable|string
    {
        return $this->tool->handle(new Request($arguments));
    }

    /**
     * Underlying laravel/ai tool (chat adapter unwrap).
     */
    public function laravelTool(): Tool
    {
        return $this->tool;
    }
}

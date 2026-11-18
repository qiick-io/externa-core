<?php

declare(strict_types=1);

namespace App\Mcp\Tools;

use App\Mcp\Tools\Concerns\DelegatesToRegistryMcpToolTrait;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\JsonSchema\Types\Type;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsDestructive;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

/**
 * MCP schema tool: create a collection on the collection builder's validation and action (#766).
 */
#[Name('create_collection')]
#[Title('Create collection')]
#[Description('Create a collection (a list, or a singleton with one item). Then add its fields with create_field. Needs an mcp:write key with collections:write.')]
#[IsReadOnly(false)]
#[IsDestructive(false)]
class CreateCollection extends Tool
{
    use DelegatesToRegistryMcpToolTrait;

    protected function isWriteTool(): bool
    {
        return true;
    }

    protected function registryToolName(): string
    {
        return 'ManageCollections';
    }

    /**
     * @param  array<string, mixed>  $arguments
     * @return array<string, mixed>
     */
    protected function mapArguments(array $arguments): array
    {
        return [
            'action' => 'create',
            'name' => (string) ($arguments['name'] ?? ''),
            'slug' => (string) ($arguments['slug'] ?? ''),
            'is_singleton' => (bool) ($arguments['is_singleton'] ?? false),
        ];
    }

    /**
     * @return array<string, Type>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'name' => $schema->string()->description('Collection name')->required(),
            'slug' => $schema->string()->description('URL slug (a-z, 0-9, hyphens); derived from the name when empty'),
            'is_singleton' => $schema->boolean()->description('True for a singleton (one item, e.g. site settings), false for a list'),
        ];
    }
}

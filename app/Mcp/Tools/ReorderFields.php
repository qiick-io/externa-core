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
 * MCP schema tool: put a collection's fields in a new order on the field builder's action (#766).
 */
#[Name('reorder_fields')]
#[Title('Reorder fields')]
#[Description('Put a collection\'s fields in a new order: list every field id once, in the new order. Needs an mcp:write key with collections:write.')]
#[IsReadOnly(false)]
#[IsDestructive(false)]
class ReorderFields extends Tool
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
            'action' => 'reorder_fields',
            'collection_id' => (int) ($arguments['collection_id'] ?? 0),
            'field_ids' => array_values(array_map(intval(...), (array) ($arguments['field_ids'] ?? []))),
        ];
    }

    /**
     * @return array<string, Type>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'collection_id' => $schema->integer()->description('Collection id')->required(),
            'field_ids' => $schema->array()->items($schema->integer())->description('Every field id of the collection, in the new order')->required(),
        ];
    }
}

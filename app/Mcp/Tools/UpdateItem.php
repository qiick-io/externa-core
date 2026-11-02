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

#[Name('update_item')]
#[Title('Update item')]
#[Description('Update a collection item. Requires AI_MCP_WRITE_ENABLED, mcp:write, and human approval when gated.')]
#[IsReadOnly(false)]
#[IsDestructive(false)]
class UpdateItem extends Tool
{
    use DelegatesToRegistryMcpToolTrait;

    protected function isWriteTool(): bool
    {
        return true;
    }

    protected function registryToolName(): string
    {
        return 'ManageCollectionItems';
    }

    /**
     * @param  array<string, mixed>  $arguments
     * @return array<string, mixed>
     */
    protected function mapArguments(array $arguments): array
    {
        return [
            'action' => 'update',
            'item_id' => (int) ($arguments['item_id'] ?? 0),
            'data_json' => (string) ($arguments['data_json'] ?? '{}'),
        ];
    }

    /**
     * @return array<string, Type>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'item_id' => $schema->integer()->description('Collection item id')->required(),
            'data_json' => $schema->string()->description('JSON object of field values to merge')->required(),
        ];
    }
}

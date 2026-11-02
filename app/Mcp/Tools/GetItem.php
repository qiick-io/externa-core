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
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[Name('get_item')]
#[Title('Get item')]
#[Description('Fetch a single collection item by id (permission-aware).')]
#[IsReadOnly]
class GetItem extends Tool
{
    use DelegatesToRegistryMcpToolTrait;

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
            'action' => 'get',
            'item_id' => (int) ($arguments['item_id'] ?? 0),
        ];
    }

    /**
     * @return array<string, Type>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'item_id' => $schema->integer()->description('Collection item id')->required(),
        ];
    }
}

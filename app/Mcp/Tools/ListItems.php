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

#[Name('list_items')]
#[Title('List items')]
#[Description('Query collection items with optional filters (permission-aware).')]
#[IsReadOnly]
class ListItems extends Tool
{
    use DelegatesToRegistryMcpToolTrait;

    protected function registryToolName(): string
    {
        return 'QueryCollectionItems';
    }

    /**
     * @param  array<string, mixed>  $arguments
     * @return array<string, mixed>
     */
    protected function mapArguments(array $arguments): array
    {
        return [
            'collection_id' => (int) ($arguments['collection_id'] ?? 0),
            'filter_json' => (string) ($arguments['filter_json'] ?? '{}'),
            'limit' => (int) ($arguments['limit'] ?? 25),
        ];
    }

    /**
     * @return array<string, Type>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'collection_id' => $schema->integer()->description('Collection id')->required(),
            'filter_json' => $schema->string()->description('JSON object of field filters'),
            'limit' => $schema->integer()->description('Max rows (1–100, default 25)'),
        ];
    }
}

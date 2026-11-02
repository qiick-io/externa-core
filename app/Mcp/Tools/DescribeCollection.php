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

#[Name('describe_collection')]
#[Title('Describe collection')]
#[Description('Return a collection schema (fields, types, translatable flags) by collection id.')]
#[IsReadOnly]
class DescribeCollection extends Tool
{
    use DelegatesToRegistryMcpToolTrait;

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
            'action' => 'get',
            'collection_id' => (int) ($arguments['collection_id'] ?? 0),
        ];
    }

    /**
     * @return array<string, Type>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'collection_id' => $schema->integer()->description('Collection id')->required(),
        ];
    }
}

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

#[Name('search')]
#[Title('Search similar items')]
#[Description('Embedding similarity search across collection items the identity can read.')]
#[IsReadOnly]
class Search extends Tool
{
    use DelegatesToRegistryMcpToolTrait;

    protected function registryToolName(): string
    {
        return 'SearchSimilarCollectionItems';
    }

    /**
     * @param  array<string, mixed>  $arguments
     * @return array<string, mixed>
     */
    protected function mapArguments(array $arguments): array
    {
        return [
            'collection_id' => (int) ($arguments['collection_id'] ?? 0),
            'query' => (string) ($arguments['query'] ?? ''),
            'limit' => (int) ($arguments['limit'] ?? 10),
        ];
    }

    /**
     * @return array<string, Type>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'collection_id' => $schema->integer()->description('Collection id')->required(),
            'query' => $schema->string()->description('Search text')->required(),
            'limit' => $schema->integer()->description('Max results'),
        ];
    }
}

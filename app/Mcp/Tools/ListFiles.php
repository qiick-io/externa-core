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

#[Name('list_files')]
#[Title('List files')]
#[Description('List or search files the identity can read (metadata only).')]
#[IsReadOnly]
class ListFiles extends Tool
{
    use DelegatesToRegistryMcpToolTrait;

    protected function registryToolName(): string
    {
        return 'ManageFiles';
    }

    /**
     * @param  array<string, mixed>  $arguments
     * @return array<string, mixed>
     */
    protected function mapArguments(array $arguments): array
    {
        $mapped = [
            'action' => 'list',
            'limit' => (int) ($arguments['limit'] ?? 50),
        ];

        if (array_key_exists('parent_id', $arguments)) {
            $mapped['parent_id'] = (int) $arguments['parent_id'];
        }

        if (isset($arguments['query']) && is_string($arguments['query']) && $arguments['query'] !== '') {
            $mapped['action'] = 'search';
            $mapped['query'] = $arguments['query'];
        }

        return $mapped;
    }

    /**
     * @return array<string, Type>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'parent_id' => $schema->integer()->description('Folder id; 0 or omit for root'),
            'query' => $schema->string()->description('Optional name/path search'),
            'limit' => $schema->integer()->description('Max rows (1–100)'),
        ];
    }
}

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

#[Name('list_collections')]
#[Title('List collections')]
#[Description('List content collections visible to the authenticated identity.')]
#[IsReadOnly]
class ListCollections extends Tool
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
            'action' => 'list',
            'trashed' => (bool) ($arguments['trashed'] ?? false),
        ];
    }

    /**
     * @return array<string, Type>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'trashed' => $schema->boolean()->description('When true, list only soft-deleted collections'),
        ];
    }
}

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

#[Name('move_file')]
#[Title('Move file')]
#[Description('Move a file into another folder. Requires AI_MCP_WRITE_ENABLED and mcp:write.')]
#[IsReadOnly(false)]
#[IsDestructive(false)]
class MoveFile extends Tool
{
    use DelegatesToRegistryMcpToolTrait;

    protected function isWriteTool(): bool
    {
        return true;
    }

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
        return [
            'action' => 'move',
            'file_id' => (int) ($arguments['file_id'] ?? 0),
            'target_parent_id' => (int) ($arguments['target_parent_id'] ?? 0),
        ];
    }

    /**
     * @return array<string, Type>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'file_id' => $schema->integer()->description('File id to move')->required(),
            'target_parent_id' => $schema->integer()->description('Destination folder id; 0 = root')->required(),
        ];
    }
}

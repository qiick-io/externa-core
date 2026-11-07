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

#[Name('tag_file')]
#[Title('Tag file')]
#[Description('Replace tags on a file. Requires AI_MCP_WRITE_ENABLED, mcp:write, and human approval when gated.')]
#[IsReadOnly(false)]
#[IsDestructive(false)]
class TagFile extends Tool
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
            'action' => 'tag',
            'file_id' => (int) ($arguments['file_id'] ?? 0),
            'tags_json' => (string) ($arguments['tags_json'] ?? '[]'),
        ];
    }

    /**
     * @return array<string, Type>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'file_id' => $schema->integer()->description('File id')->required(),
            'tags_json' => $schema->string()->description('JSON array of tag names, e.g. ["hero","draft"]')->required(),
        ];
    }
}

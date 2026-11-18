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
 * MCP schema tool: add a field to a collection on the field builder's validation and action (#766).
 */
#[Name('create_field')]
#[Title('Create field')]
#[Description('Add a field to a collection: name, type, per-locale flag and settings (required, validation, relations). Needs an mcp:write key with collections:write.')]
#[IsReadOnly(false)]
#[IsDestructive(false)]
class CreateField extends Tool
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
            'action' => 'create_field',
            'collection_id' => (int) ($arguments['collection_id'] ?? 0),
            'name' => (string) ($arguments['name'] ?? ''),
            'type' => (string) ($arguments['type'] ?? ''),
            'translatable' => (bool) ($arguments['translatable'] ?? false),
            'settings_json' => (string) ($arguments['settings_json'] ?? ''),
        ];
    }

    /**
     * @return array<string, Type>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'collection_id' => $schema->integer()->description('Collection id')->required(),
            'name' => $schema->string()->description('Field key (a-z, 0-9, hyphens or underscores)')->required(),
            'type' => $schema->string()->description('Field type, e.g. string, textarea, richtext, number, boolean, date, select, relation, file')->required(),
            'translatable' => $schema->boolean()->description('One value per locale'),
            'settings_json' => $schema->string()->description('JSON object of field settings, e.g. {"required": true}'),
        ];
    }
}

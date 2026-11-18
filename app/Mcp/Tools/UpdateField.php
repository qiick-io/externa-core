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
 * MCP schema tool: change a field's settings on the field builder's validation and action (#766).
 */
#[Name('update_field')]
#[Title('Update field')]
#[Description('Change a field: name, type, per-locale flag or settings. A type or per-locale change is refused once the field has content. Needs an mcp:write key with collections:write.')]
#[IsReadOnly(false)]
#[IsDestructive(false)]
class UpdateField extends Tool
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
     * Only the arguments the caller sent, so an omitted one keeps its current value.
     *
     * @param  array<string, mixed>  $arguments
     * @return array<string, mixed>
     */
    protected function mapArguments(array $arguments): array
    {
        $mapped = ['action' => 'update_field', 'field_id' => (int) ($arguments['field_id'] ?? 0)];

        foreach (['name', 'type', 'settings_json'] as $key) {
            if (isset($arguments[$key])) {
                $mapped[$key] = (string) $arguments[$key];
            }
        }

        if (isset($arguments['translatable'])) {
            $mapped['translatable'] = (bool) $arguments['translatable'];
        }

        return $mapped;
    }

    /**
     * @return array<string, Type>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'field_id' => $schema->integer()->description('Field id')->required(),
            'name' => $schema->string()->description('New field key'),
            'type' => $schema->string()->description('New field type'),
            'translatable' => $schema->boolean()->description('One value per locale'),
            'settings_json' => $schema->string()->description('JSON object replacing the field settings, e.g. {"required": true}'),
        ];
    }
}

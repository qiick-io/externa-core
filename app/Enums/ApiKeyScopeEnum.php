<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Named API key capability scopes (MCP and future surfaces).
 *
 * Distinct from collection_slugs / read_only / files_scope narrowing.
 */
enum ApiKeyScopeEnum: string
{
    case McpRead = 'mcp:read';
    case McpWrite = 'mcp:write';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(
            static fn (self $case): string => $case->value,
            self::cases(),
        );
    }
}

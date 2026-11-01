<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Risk classification for AI / MCP tools in the shared registry.
 */
enum AiToolKindEnum: string
{
    case Read = 'read';
    case Write = 'write';
    case Destructive = 'destructive';

    /**
     * Whether this kind mutates data (gated by ai.tools.write_enabled unless opted in).
     */
    public function isMutating(): bool
    {
        return $this !== self::Read;
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}

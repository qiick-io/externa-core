<?php

namespace App\Services\Notifiers;

use App\Services\Webhooks\OutboundWebhookCatalog;

/**
 * Human-readable one-liner / short block for Slack and Telegram fan-out.
 */
final class OutboundNotifierMessageFormatter
{
    /**
     * @param  array<string, mixed>  $data
     */
    public static function format(string $type, array $data = []): string
    {
        $description = OutboundWebhookCatalog::EVENTS[$type] ?? $type;
        $lines = ["*{$type}* — {$description}"];

        if (isset($data['collection_slug']) && is_string($data['collection_slug'])) {
            $lines[] = 'Collection: `'.$data['collection_slug'].'`';
        }
        if (isset($data['collection_id'])) {
            $lines[] = 'Collection ID: '.$data['collection_id'];
        }
        if (isset($data['item_id'])) {
            $lines[] = 'Item ID: '.$data['item_id'];
        }
        if (isset($data['file_id'])) {
            $lines[] = 'File ID: '.$data['file_id'];
        }
        if (isset($data['scheduled']) && $data['scheduled']) {
            $lines[] = '(scheduled publish)';
        }

        return implode("\n", $lines);
    }
}

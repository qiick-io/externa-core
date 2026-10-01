<?php

namespace App\Services\Webhooks;

/**
 * Frozen list of outbound webhook event types emitted by Externa.
 *
 * Adding a type is non-breaking; renaming or removing one is breaking for consumers.
 */
final class OutboundWebhookCatalog
{
    /**
     * @var array<string, string>
     */
    public const EVENTS = [
        'item.created' => 'A collection item was created.',
        'item.updated' => 'A collection item\'s values were saved.',
        'item.published' => 'A draft was promoted to published values (manual or scheduled).',
        'item.deleted' => 'A collection item was moved to trash or permanently deleted.',
        'item.restored' => 'A trashed collection item was restored.',
        'collection.created' => 'A collection was created.',
        'collection.updated' => 'A collection\'s settings were updated.',
        'collection.deleted' => 'A collection was moved to trash or permanently deleted.',
        'file.created' => 'A file was uploaded to the Files pool.',
        'file.updated' => 'A file was renamed, moved, replaced, or its metadata changed.',
        'file.deleted' => 'A file was moved to trash or permanently deleted.',
        'ping' => 'Test event sent from Project settings.',
    ];

    /**
     * @return list<string>
     */
    public static function types(): array
    {
        return array_keys(self::EVENTS);
    }

    public static function has(string $type): bool
    {
        return array_key_exists($type, self::EVENTS);
    }

    /**
     * @return list<array{type: string, description: string}>
     */
    public static function all(): array
    {
        $events = [];
        foreach (self::EVENTS as $type => $description) {
            $events[] = ['type' => $type, 'description' => $description];
        }

        return $events;
    }
}

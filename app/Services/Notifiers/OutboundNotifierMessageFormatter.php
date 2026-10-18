<?php

namespace App\Services\Notifiers;

use App\Services\Webhooks\OutboundWebhookCatalog;

/**
 * Human-readable short block for Slack and Telegram fan-out.
 *
 * Slack uses mrkdwn (*bold*, `code`, <url|label>). Telegram Bot API needs
 * parse_mode=HTML (<b>, <code>, <a>) with escaped dynamic text.
 */
final class OutboundNotifierMessageFormatter
{
    public const CHANNEL_SLACK = 'slack';

    public const CHANNEL_TELEGRAM = 'telegram';

    /**
     * Human headline per catalog event (not the machine type key).
     *
     * @var array<string, string>
     */
    public const TITLES = [
        'item.created' => 'Item created',
        'item.updated' => 'Item updated',
        'item.published' => 'Item published',
        'item.submitted' => 'Item submitted for review',
        'item.approved' => 'Item approved',
        'item.rejected' => 'Item rejected',
        'item.deleted' => 'Item deleted',
        'item.restored' => 'Item restored',
        'collection.created' => 'Collection created',
        'collection.updated' => 'Collection updated',
        'collection.deleted' => 'Collection deleted',
        'file.created' => 'File uploaded',
        'file.updated' => 'File updated',
        'file.deleted' => 'File deleted',
        'ping' => 'Test ping',
    ];

    public static function titleFor(string $type): string
    {
        return self::TITLES[$type] ?? $type;
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  self::CHANNEL_*  $channel
     */
    public static function format(string $type, array $data = [], string $channel = self::CHANNEL_SLACK): string
    {
        if (! isset($data['event_title'])) {
            $data = app(OutboundNotifierContextBuilder::class)->enrich($type, $data);
        }

        $title = is_string($data['event_title'] ?? null)
            ? $data['event_title']
            : self::titleFor($type);
        $description = OutboundWebhookCatalog::EVENTS[$type] ?? $type;

        if ($channel === self::CHANNEL_TELEGRAM) {
            return self::formatTelegram($title, $description, $data);
        }

        return self::formatSlack($title, $description, $data);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private static function formatSlack(string $title, string $description, array $data): string
    {
        $lines = ["*{$title}*", $description, ''];

        self::appendSharedLines($lines, $data, slack: true);

        return rtrim(implode("\n", $lines));
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private static function formatTelegram(string $title, string $description, array $data): string
    {
        $lines = [
            '<b>'.self::escapeHtml($title).'</b>',
            self::escapeHtml($description),
            '',
        ];

        self::appendSharedLines($lines, $data, slack: false);

        return rtrim(implode("\n", $lines));
    }

    /**
     * @param  list<string>  $lines
     * @param  array<string, mixed>  $data
     */
    private static function appendSharedLines(array &$lines, array $data, bool $slack): void
    {
        if (isset($data['item_id'])) {
            $itemLabel = self::stringOrNull($data['item_title'] ?? null);
            $id = (string) $data['item_id'];
            if ($itemLabel !== null) {
                $lines[] = $slack
                    ? "Item: *{$itemLabel}* (#{$id})"
                    : 'Item: <b>'.self::escapeHtml($itemLabel).'</b> (#'.self::escapeHtml($id).')';
            } else {
                $lines[] = 'Item: #'.($slack ? $id : self::escapeHtml($id));
            }
        }

        if (isset($data['file_id'])) {
            $fileLabel = self::stringOrNull($data['file_name'] ?? null);
            $id = (string) $data['file_id'];
            if ($fileLabel !== null) {
                $lines[] = $slack
                    ? "File: *{$fileLabel}* (#{$id})"
                    : 'File: <b>'.self::escapeHtml($fileLabel).'</b> (#'.self::escapeHtml($id).')';
            } else {
                $lines[] = 'File: #'.($slack ? $id : self::escapeHtml($id));
            }
        }

        $collectionName = self::stringOrNull($data['collection_name'] ?? null);
        $collectionSlug = self::stringOrNull($data['collection_slug'] ?? null);
        if ($collectionName !== null || $collectionSlug !== null) {
            if ($collectionName !== null && $collectionSlug !== null) {
                $lines[] = $slack
                    ? "Collection: {$collectionName} (`{$collectionSlug}`)"
                    : 'Collection: '.self::escapeHtml($collectionName)
                        .' (<code>'.self::escapeHtml($collectionSlug).'</code>)';
            } elseif ($collectionName !== null) {
                $lines[] = $slack
                    ? "Collection: {$collectionName}"
                    : 'Collection: '.self::escapeHtml($collectionName);
            } else {
                $lines[] = $slack
                    ? "Collection: `{$collectionSlug}`"
                    : 'Collection: <code>'.self::escapeHtml((string) $collectionSlug).'</code>';
            }
        } elseif (isset($data['collection_id'])) {
            $lines[] = 'Collection ID: '.($slack
                ? (string) $data['collection_id']
                : self::escapeHtml((string) $data['collection_id']));
        }

        $status = self::statusLabel($data);
        if ($status !== null) {
            $lines[] = $slack
                ? "Status: {$status}"
                : 'Status: '.self::escapeHtml($status);
        }

        $actor = self::actorLabel($data);
        if ($actor !== null) {
            $lines[] = $slack
                ? "By: {$actor}"
                : 'By: '.self::escapeHtml($actor);
        }

        if (isset($data['rejection_note']) && is_string($data['rejection_note']) && $data['rejection_note'] !== '') {
            $lines[] = $slack
                ? "Note: {$data['rejection_note']}"
                : 'Note: '.self::escapeHtml($data['rejection_note']);
        }

        $when = self::stringOrNull($data['occurred_at'] ?? null);
        if ($when !== null) {
            $lines[] = $slack
                ? "When: {$when}"
                : 'When: '.self::escapeHtml($when);
        }

        $url = self::stringOrNull($data['admin_url'] ?? null);
        if ($url !== null) {
            $lines[] = $slack
                ? "<{$url}|Open in Externa>"
                : '<a href="'.self::escapeHtml($url).'">Open in Externa</a>';
        }
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private static function statusLabel(array $data): ?string
    {
        $parts = [];
        $status = self::stringOrNull($data['approval_status'] ?? null);
        if ($status !== null) {
            $parts[] = str_replace('_', ' ', $status);
        }
        if (! empty($data['scheduled'])) {
            $parts[] = 'scheduled';
        }

        if ($parts === []) {
            return null;
        }

        return implode(' · ', $parts);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private static function actorLabel(array $data): ?string
    {
        $name = self::stringOrNull($data['actor_name'] ?? null);
        $email = self::stringOrNull($data['actor_email'] ?? null);

        if ($name !== null && $email !== null) {
            return "{$name} ({$email})";
        }

        return $name ?? $email;
    }

    private static function stringOrNull(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed !== '' ? $trimmed : null;
    }

    private static function escapeHtml(string $value): string
    {
        // Telegram HTML only documents &lt; &gt; &amp; &quot; — not &apos;.
        return htmlspecialchars($value, ENT_COMPAT | ENT_HTML5, 'UTF-8');
    }
}

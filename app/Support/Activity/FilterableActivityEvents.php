<?php

namespace App\Support\Activity;

/**
 * Canonical activity-log event names exposed to admin filters and AI tools.
 */
final class FilterableActivityEvents
{
    /**
     * @var list<string>
     */
    public const ALL = [
        'created',
        'updated',
        'deleted',
        'restored',
        'login',
        'logout',
        'failed',
        'ai_prompt',
        'ai_response',
        'ai_tool',
        'ai_mutation',
        'settings_updated',
        'chat_message',
        'chat_message_deleted',
        'permissions_synced',
        'roles_synced',
        'groups_synced',
        'members_synced',
        'collection_permissions_synced',
        'file_permissions_synced',
    ];

    /**
     * @return list<string>
     */
    public static function all(): array
    {
        return self::ALL;
    }

    public static function isValid(string $event): bool
    {
        return in_array($event, self::ALL, true);
    }
}

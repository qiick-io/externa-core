<?php

namespace App\Services\Settings;

use App\Models\User;

/**
 * User-scoped notification sound preferences.
 */
class UserNotificationPreferences
{
    public const GROUP = 'notifications';

    public const KEY_SOUND_CHAT = 'sound_chat_enabled';

    public const KEY_SOUND_NOTIFICATIONS = 'sound_notifications_enabled';

    public function __construct(
        private readonly SettingsRepository $settings,
    ) {}

    /**
     * @return array<string, bool>
     */
    public function defaults(): array
    {
        return [
            self::KEY_SOUND_CHAT => false,
            self::KEY_SOUND_NOTIFICATIONS => false,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function forUser(User $user): array
    {
        return $this->settings->forUser($user, self::GROUP, $this->defaults());
    }

    /**
     * @return array{sound_chat_enabled: bool, sound_notifications_enabled: bool}
     */
    public function shared(User $user): array
    {
        $prefs = $this->forUser($user);

        return [
            'sound_chat_enabled' => (bool) ($prefs[self::KEY_SOUND_CHAT] ?? false),
            'sound_notifications_enabled' => (bool) ($prefs[self::KEY_SOUND_NOTIFICATIONS] ?? false),
        ];
    }

    /**
     * @param  array{sound_chat_enabled?: bool, sound_notifications_enabled?: bool}  $values
     */
    public function update(User $user, array $values): void
    {
        $this->settings->setMany(
            SettingsRepository::SCOPE_USER,
            self::GROUP,
            [
                self::KEY_SOUND_CHAT => (bool) ($values['sound_chat_enabled'] ?? false),
                self::KEY_SOUND_NOTIFICATIONS => (bool) ($values['sound_notifications_enabled'] ?? false),
            ],
            $user->id,
        );
    }
}

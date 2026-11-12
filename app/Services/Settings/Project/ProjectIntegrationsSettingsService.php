<?php

declare(strict_types=1);

namespace App\Services\Settings\Project;

use App\Data\Deploy\DeployHookData;
use App\Services\Settings\ProjectSettingsService;

/**
 * Reads the Integrations project settings: the outbound webhook, the Slack /
 * Telegram notifiers and the deploy hooks.
 *
 * Plain values come from the shared, memoized {@see ProjectSettingsService::raw()};
 * secrets and deploy-hook URLs are stored encrypted and only leave this class
 * decrypted through {@see ProjectSettingsService::decryptSecret()}.
 */
class ProjectIntegrationsSettingsService
{
    public function __construct(
        private readonly ProjectSettingsService $projectSettings,
    ) {}

    public function webhookUrl(): ?string
    {
        return $this->projectSettings->raw()['webhook_url'];
    }

    /**
     * Decrypted webhook signing secret, or null when unset/unreadable.
     *
     * ponytail: legacy plaintext secrets are rejected (decrypt fails → null);
     * re-save via settings UI.
     */
    public function webhookSecret(): ?string
    {
        return $this->projectSettings->storedSecret('webhook_secret');
    }

    public function notifierSlackWebhookUrl(): ?string
    {
        return $this->projectSettings->raw()['notifier_slack_webhook_url'];
    }

    public function notifierTelegramChatId(): ?string
    {
        $chatId = $this->projectSettings->raw()['notifier_telegram_chat_id'];

        return is_string($chatId) && $chatId !== '' ? $chatId : null;
    }

    public function isNotifierTelegramConfigured(): bool
    {
        return $this->notifierTelegramBotToken() !== null
            && $this->notifierTelegramChatId() !== null;
    }

    /**
     * Whether Slack/Telegram fan-out should emit this event type.
     *
     * `ping` always allowed (Send test). Null setting = all domain events (legacy).
     */
    public function canAllowNotifierEvent(string $type): bool
    {
        if ($type === 'ping') {
            return true;
        }

        return in_array($type, $this->projectSettings->raw()['notifier_event_types'], true);
    }

    /**
     * Decrypted Telegram bot token, or null when unset/unreadable.
     */
    public function notifierTelegramBotToken(): ?string
    {
        return $this->projectSettings->storedSecret('notifier_telegram_bot_token');
    }

    /**
     * Decryptable deploy hooks for runtime delivery.
     *
     * @return list<DeployHookData>
     */
    public function deployHooks(): array
    {
        $hooks = [];

        foreach ($this->projectSettings->raw()['deploy_hooks'] as $row) {
            if (! is_array($row)) {
                continue;
            }

            $id = is_string($row['id'] ?? null) ? $row['id'] : null;
            $name = is_string($row['name'] ?? null) ? trim($row['name']) : '';
            if ($id === null || $name === '') {
                continue;
            }

            $url = $this->projectSettings->decryptSecret($row['url'] ?? null);

            if ($url === null) {
                continue;
            }

            $hooks[] = new DeployHookData($id, $name, $url);
        }

        return $hooks;
    }

    public function deployHookById(string $hookId): ?DeployHookData
    {
        foreach ($this->deployHooks() as $hook) {
            if ($hook->id === $hookId) {
                return $hook;
            }
        }

        return null;
    }

    public function isDeployOnPublishEnabled(): bool
    {
        return (bool) $this->projectSettings->raw()['deploy_on_publish'];
    }

    /**
     * Edit-safe deploy hooks (never includes plaintext URLs).
     *
     * @return list<array{id: string, name: string, url_configured: bool}>
     */
    public function deployHooksForEdit(): array
    {
        $hooks = [];

        foreach ($this->projectSettings->raw()['deploy_hooks'] as $row) {
            if (! is_array($row)) {
                continue;
            }

            $id = is_string($row['id'] ?? null) ? $row['id'] : null;
            $name = is_string($row['name'] ?? null) ? trim($row['name']) : '';
            $cipher = is_string($row['url'] ?? null) ? $row['url'] : null;

            if ($id === null || $name === '') {
                continue;
            }

            $hooks[] = [
                'id' => $id,
                'name' => $name,
                'url_configured' => is_string($cipher) && $cipher !== '',
            ];
        }

        return $hooks;
    }
}

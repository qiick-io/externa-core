<?php

declare(strict_types=1);

namespace App\Services\Settings\Project;

use App\Data\Deploy\DeployHookData;
use App\Services\Settings\ProjectSettingsService;
use App\Services\Webhooks\OutboundWebhookCatalogService;
use App\Traits\NormalizesProjectSettingValuesTrait;

/**
 * Reads the Integrations project settings: the outbound webhook, the Slack /
 * Telegram notifiers and the deploy hooks.
 *
 * Plain values come from the shared, memoized {@see ProjectSettingsService::raw()};
 * secrets and deploy-hook URLs are stored encrypted and only leave this class
 * decrypted through {@see ProjectSettingsService::decryptSecret()}.
 *
 * This area's keys of the stored bag are normalized here ({@see normalize()}),
 * and {@see ProjectSettingsService::raw()} composes them with the other areas.
 */
class ProjectIntegrationsSettingsService
{
    use NormalizesProjectSettingValuesTrait;

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

    /**
     * Normalized stored deploy hooks with their URLs still encrypted, for the save
     * request that keeps an unchanged URL and checks which hook ids already exist.
     *
     * @return list<array{id: string, name: string, url: string}>
     */
    public function storedDeployHooks(): array
    {
        return $this->projectSettings->raw()['deploy_hooks'];
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

    /**
     * Normalize the Integrations keys (webhook, notifiers, deploy hooks) of a stored
     * `project` bag. Secrets and deploy-hook URLs stay ciphertext.
     *
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>
     */
    public function normalize(array $raw): array
    {
        return [
            'webhook_url' => $this->nullableUrl($raw['webhook_url'] ?? null),
            // Encrypted ciphertext (or null) — decrypt only via webhookSecret()
            'webhook_secret' => is_string($raw['webhook_secret'] ?? null) && $raw['webhook_secret'] !== ''
                ? $raw['webhook_secret']
                : null,
            'notifier_slack_webhook_url' => $this->nullableUrl($raw['notifier_slack_webhook_url'] ?? null),
            'notifier_telegram_bot_token' => is_string($raw['notifier_telegram_bot_token'] ?? null)
                && $raw['notifier_telegram_bot_token'] !== ''
                ? $raw['notifier_telegram_bot_token']
                : null,
            'notifier_telegram_chat_id' => is_string($raw['notifier_telegram_chat_id'] ?? null)
                && trim($raw['notifier_telegram_chat_id']) !== ''
                ? trim($raw['notifier_telegram_chat_id'])
                : null,
            'notifier_event_types' => $this->normalizeNotifierEventTypes($raw['notifier_event_types'] ?? null),
            'deploy_hooks' => $this->normalizeDeployHooks($raw['deploy_hooks'] ?? null),
            'deploy_on_publish' => (bool) ($raw['deploy_on_publish'] ?? false),
        ];
    }

    /**
     * @return list<string>
     */
    private function normalizeNotifierEventTypes(mixed $value): array
    {
        $allowed = OutboundWebhookCatalogService::notifierSelectableTypes();

        if ($value === null) {
            return $allowed;
        }

        if (! is_array($value)) {
            return $allowed;
        }

        $selected = [];
        foreach ($value as $type) {
            if (! is_string($type) || $type === '' || isset($selected[$type])) {
                continue;
            }
            if (! in_array($type, $allowed, true)) {
                continue;
            }
            $selected[$type] = $type;
        }

        return array_values($selected);
    }

    /**
     * Stored deploy hooks (ciphertext URLs). Max 10 named hooks.
     *
     * @return list<array{id: string, name: string, url: string}>
     */
    private function normalizeDeployHooks(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $hooks = [];

        foreach ($value as $row) {
            if (! is_array($row) || count($hooks) >= 10) {
                break;
            }

            $id = is_string($row['id'] ?? null) ? trim($row['id']) : '';
            $name = is_string($row['name'] ?? null) ? trim($row['name']) : '';
            $url = is_string($row['url'] ?? null) ? $row['url'] : '';

            if ($id === '' || $name === '' || $url === '') {
                continue;
            }

            if (strlen($name) > 120) {
                $name = substr($name, 0, 120);
            }

            $hooks[] = [
                'id' => $id,
                'name' => $name,
                'url' => $url,
            ];
        }

        return $hooks;
    }
}

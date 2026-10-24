<?php

namespace App\Http\Requests\Settings;

use App\Ai\Support\SafeRemoteUrlValidator;
use App\Http\Requests\Settings\Concerns\AuthorizesProjectSettingsTrait;
use App\Services\Settings\ProjectSettings;
use App\Services\Webhooks\OutboundWebhookCatalog;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validate integrations project settings (webhooks + outbound notifiers).
 */
class UpdateProjectIntegrationsSettingsRequest extends FormRequest
{
    use AuthorizesProjectSettingsTrait;

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'webhook_url' => ['nullable', 'url', 'max:2048'],
            // Empty = keep existing secret; never required on every save
            'webhook_secret' => ['nullable', 'string', 'max:512'],
            'notifier_slack_webhook_url' => ['nullable', 'url', 'max:2048'],
            // BotFather token shape: "<bot_id>:<secret>" — rejects usernames like "MyBot"
            'notifier_telegram_bot_token' => ['nullable', 'string', 'max:512', 'regex:/^\d+:[A-Za-z0-9_-]+$/'],
            'notifier_telegram_chat_id' => ['nullable', 'string', 'max:64'],
            'notifier_event_types' => ['nullable', 'array'],
            'notifier_event_types.*' => [
                'string',
                Rule::in(OutboundWebhookCatalog::notifierSelectableTypes()),
            ],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            foreach (['webhook_url', 'notifier_slack_webhook_url'] as $urlField) {
                $url = $this->input($urlField);
                if (! is_string($url) || trim($url) === '') {
                    continue;
                }

                $ssrf = SafeRemoteUrlValidator::validateOutboundWebhook($url);
                if ($ssrf !== null) {
                    $message = str_starts_with($ssrf, 'Error: ')
                        ? substr($ssrf, strlen('Error: '))
                        : $ssrf;
                    $validator->errors()->add($urlField, $message);
                }
            }
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function projectValues(): array
    {
        $validated = $this->validated();

        return [
            'webhook_url' => $validated['webhook_url'] ?? null,
            'notifier_slack_webhook_url' => $validated['notifier_slack_webhook_url'] ?? null,
            'notifier_telegram_chat_id' => $validated['notifier_telegram_chat_id'] ?? null,
            // Missing key (legacy payloads) → keep all; explicit [] → notify none.
            'notifier_event_types' => array_values(
                $validated['notifier_event_types']
                    ?? OutboundWebhookCatalog::notifierSelectableTypes(),
            ),
            ...$this->webhookSecretValue($validated),
            ...$this->notifierTelegramBotTokenValue($validated),
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array{webhook_secret?: string}
     */
    private function webhookSecretValue(array $validated): array
    {
        $secret = $validated['webhook_secret'] ?? null;
        if (! is_string($secret) || trim($secret) === '') {
            return [];
        }

        return [
            'webhook_secret' => ProjectSettings::encryptWebhookSecret(trim($secret)),
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array{notifier_telegram_bot_token?: string}
     */
    private function notifierTelegramBotTokenValue(array $validated): array
    {
        $token = $validated['notifier_telegram_bot_token'] ?? null;
        if (! is_string($token) || trim($token) === '') {
            return [];
        }

        return [
            'notifier_telegram_bot_token' => ProjectSettings::encryptNotifierTelegramBotToken(trim($token)),
        ];
    }

    protected function prepareForValidation(): void
    {
        $merge = [];

        foreach ([
            'webhook_url',
            'webhook_secret',
            'notifier_slack_webhook_url',
            'notifier_telegram_bot_token',
            'notifier_telegram_chat_id',
        ] as $field) {
            if ($this->has($field) && $this->input($field) === '') {
                $merge[$field] = null;
            }
        }

        if ($this->has('notifier_event_types') && is_string($this->input('notifier_event_types'))) {
            $decoded = json_decode((string) $this->input('notifier_event_types'), true);
            if (is_array($decoded)) {
                $merge['notifier_event_types'] = $decoded;
            }
        }

        if ($merge !== []) {
            $this->merge($merge);
        }
    }
}

<?php

namespace App\Http\Requests\Settings;

use App\Ai\Support\SafeRemoteUrlValidator;
use App\Http\Requests\Settings\Concerns\AuthorizesProjectSettingsTrait;
use App\Services\Settings\ProjectSettingsService;
use App\Services\Webhooks\OutboundWebhookCatalogService;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Validate integrations project settings (webhooks + notifiers + deploy hooks).
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
                Rule::in(OutboundWebhookCatalogService::notifierSelectableTypes()),
            ],
            'deploy_hooks' => ['nullable', 'array', 'max:10'],
            'deploy_hooks.*.id' => ['nullable', 'string', 'max:64'],
            'deploy_hooks.*.name' => ['required_with:deploy_hooks', 'string', 'max:120'],
            'deploy_hooks.*.url' => ['nullable', 'string', 'max:2048'],
            'deploy_on_publish' => ['sometimes', 'boolean'],
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

            $this->validateDeployHookUrls($validator);
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
                    ?? OutboundWebhookCatalogService::notifierSelectableTypes(),
            ),
            'deploy_hooks' => $this->deployHooksValue($validated),
            'deploy_on_publish' => (bool) ($validated['deploy_on_publish'] ?? false),
            ...$this->webhookSecretValue($validated),
            ...$this->notifierTelegramBotTokenValue($validated),
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return list<array{id: string, name: string, url: string}>
     */
    private function deployHooksValue(array $validated): array
    {
        $incoming = $validated['deploy_hooks'] ?? null;
        if (! is_array($incoming)) {
            return [];
        }

        /** @var array<string, array{id: string, name: string, url: string}> $existingById */
        $existingById = [];
        foreach (app(ProjectSettingsService::class)->integrations()->storedDeployHooks() as $row) {
            if (is_array($row) && is_string($row['id'] ?? null)) {
                $existingById[$row['id']] = [
                    'id' => $row['id'],
                    'name' => is_string($row['name'] ?? null) ? $row['name'] : '',
                    'url' => is_string($row['url'] ?? null) ? $row['url'] : '',
                ];
            }
        }

        $hooks = [];

        foreach ($incoming as $row) {
            if (! is_array($row) || count($hooks) >= 10) {
                break;
            }

            $name = is_string($row['name'] ?? null) ? trim($row['name']) : '';
            if ($name === '') {
                continue;
            }

            $id = is_string($row['id'] ?? null) && trim($row['id']) !== ''
                ? trim($row['id'])
                : (string) Str::ulid();

            $urlInput = is_string($row['url'] ?? null) ? trim($row['url']) : '';
            $existing = $existingById[$id] ?? null;

            if ($urlInput !== '') {
                $cipher = ProjectSettingsService::encryptDeployHookUrl($urlInput);
            } elseif ($existing !== null && $existing['url'] !== '') {
                $cipher = $existing['url'];
            } else {
                continue;
            }

            $hooks[] = [
                'id' => $id,
                'name' => $name,
                'url' => $cipher,
            ];
        }

        return $hooks;
    }

    /**
     * @param  Validator  $validator
     */
    private function validateDeployHookUrls($validator): void
    {
        $hooks = $this->input('deploy_hooks');
        if (! is_array($hooks)) {
            return;
        }

        /** @var array<string, true> $existingIds */
        $existingIds = [];
        foreach (app(ProjectSettingsService::class)->integrations()->storedDeployHooks() as $row) {
            if (is_array($row) && is_string($row['id'] ?? null)) {
                $existingIds[$row['id']] = true;
            }
        }

        foreach ($hooks as $index => $row) {
            if (! is_array($row)) {
                continue;
            }

            $url = is_string($row['url'] ?? null) ? trim($row['url']) : '';
            $id = is_string($row['id'] ?? null) ? trim($row['id']) : '';
            $hasExistingUrl = $id !== '' && isset($existingIds[$id]);

            if ($url === '') {
                if (! $hasExistingUrl) {
                    $validator->errors()->add("deploy_hooks.{$index}.url", __('A deploy hook URL is required.'));
                }

                continue;
            }

            if (filter_var($url, FILTER_VALIDATE_URL) === false) {
                $validator->errors()->add("deploy_hooks.{$index}.url", __('The deploy hook URL must be a valid URL.'));

                continue;
            }

            $ssrf = SafeRemoteUrlValidator::validateOutboundWebhook($url);
            if ($ssrf !== null) {
                $message = str_starts_with($ssrf, 'Error: ')
                    ? substr($ssrf, strlen('Error: '))
                    : $ssrf;
                $validator->errors()->add("deploy_hooks.{$index}.url", $message);
            }
        }
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
            'webhook_secret' => ProjectSettingsService::encryptWebhookSecret(trim($secret)),
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
            'notifier_telegram_bot_token' => ProjectSettingsService::encryptNotifierTelegramBotToken(trim($token)),
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

        if ($this->has('deploy_hooks') && is_string($this->input('deploy_hooks'))) {
            $decoded = json_decode((string) $this->input('deploy_hooks'), true);
            if (is_array($decoded)) {
                $merge['deploy_hooks'] = $decoded;
            }
        }

        if ($this->has('deploy_on_publish')) {
            $merge['deploy_on_publish'] = filter_var(
                $this->input('deploy_on_publish'),
                FILTER_VALIDATE_BOOLEAN,
            );
        }

        if ($merge !== []) {
            $this->merge($merge);
        }
    }
}

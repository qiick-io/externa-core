import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { usePendingRouterPost } from '@/components/settings/project-integrations/use-pending-router-post';
import type {
    IntegrationsFormState,
    IntegrationsProjectSettings,
} from '@/components/settings/project-integrations/integrations-form-state';
import {
    slackNotifierTest,
    telegramNotifierTest,
} from '@/routes/project/integrations';
import type { WebhookEventCatalogEntry } from '@/types';

/**
 * Slack and Telegram notifiers: which events they receive, their credentials and a
 * "send test" action for each.
 */
export function IntegrationsNotifiersSection({
    form,
    setForm,
    errors,
    project,
    webhookEvents,
}: {
    form: IntegrationsFormState;
    setForm: Dispatch<SetStateAction<IntegrationsFormState>>;
    errors: Record<string, string | undefined>;
    project: IntegrationsProjectSettings;
    webhookEvents: WebhookEventCatalogEntry[];
}) {
    const { t } = useTranslation();
    const testSlackNotifier = usePendingRouterPost(slackNotifierTest.url());
    const testTelegramNotifier = usePendingRouterPost(
        telegramNotifierTest.url(),
    );
    const notifierEventTypesError =
        errors.notifier_event_types ?? errors['notifier_event_types.0'];

    return (
        <div className="space-y-6">
            <Heading
                variant="small"
                title={t('settings.project.notifiersTitle')}
                description={t('settings.project.notifiersDescription')}
            />

            <FieldGroup className="gap-6">
                <Field
                    data-invalid={notifierEventTypesError ? true : undefined}
                >
                    <div className="space-y-1">
                        <FieldLabel>
                            {t('settings.project.notifierEventTypes')}
                        </FieldLabel>
                        <FieldDescription>
                            {t('settings.project.notifierEventTypesHint')}
                        </FieldDescription>
                    </div>
                    <div
                        className="grid gap-2 sm:grid-cols-2"
                        data-test="project-notifier-event-types"
                    >
                        {webhookEvents
                            .filter((event) => event.type !== 'ping')
                            .map((event) => {
                                const checked =
                                    form.notifier_event_types.includes(
                                        event.type,
                                    );

                                return (
                                    <label
                                        key={event.type}
                                        htmlFor={`notifier_event_${event.type}`}
                                        className="flex cursor-pointer items-start gap-3 rounded-md border border-border/60 p-3"
                                    >
                                        <Checkbox
                                            id={`notifier_event_${event.type}`}
                                            className="mt-0.5"
                                            checked={checked}
                                            onCheckedChange={(value) =>
                                                setForm((current) => {
                                                    const selected = new Set(
                                                        current.notifier_event_types,
                                                    );

                                                    if (value === true) {
                                                        selected.add(
                                                            event.type,
                                                        );
                                                    } else {
                                                        selected.delete(
                                                            event.type,
                                                        );
                                                    }

                                                    return {
                                                        ...current,
                                                        notifier_event_types:
                                                            Array.from(
                                                                selected,
                                                            ),
                                                    };
                                                })
                                            }
                                        />
                                        <span className="min-w-0 space-y-0.5">
                                            <span className="block font-mono text-sm">
                                                {event.type}
                                            </span>
                                            <span className="block text-sm text-muted-foreground">
                                                {event.description}
                                            </span>
                                        </span>
                                    </label>
                                );
                            })}
                    </div>
                    <FieldError id="notifier-event-types-error">
                        {notifierEventTypesError}
                    </FieldError>
                </Field>

                <Field
                    data-invalid={
                        errors.notifier_slack_webhook_url ? true : undefined
                    }
                >
                    <FieldLabel htmlFor="notifier_slack_webhook_url">
                        {t('settings.project.notifierSlackWebhookUrl')}
                    </FieldLabel>
                    <Input
                        id="notifier_slack_webhook_url"
                        name="notifier_slack_webhook_url"
                        type="url"
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        value={form.notifier_slack_webhook_url}
                        onChange={(event) =>
                            setForm((current) => ({
                                ...current,
                                notifier_slack_webhook_url: event.target.value,
                            }))
                        }
                        placeholder="https://hooks.slack.com/services/…"
                        data-test="project-notifier-slack-url"
                        aria-invalid={
                            errors.notifier_slack_webhook_url ? true : undefined
                        }
                        aria-describedby={
                            errors.notifier_slack_webhook_url
                                ? 'notifier-slack-webhook-url-error'
                                : 'notifier-slack-webhook-url-hint'
                        }
                    />
                    <FieldDescription id="notifier-slack-webhook-url-hint">
                        {t('settings.project.notifierSlackWebhookUrlHint')}
                    </FieldDescription>
                    <FieldError id="notifier-slack-webhook-url-error">
                        {errors.notifier_slack_webhook_url}
                    </FieldError>
                </Field>
            </FieldGroup>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                    type="button"
                    variant="secondary"
                    disabled={
                        testSlackNotifier.isPending ||
                        !project.notifier_slack_webhook_url
                    }
                    onClick={testSlackNotifier.send}
                    data-test="project-slack-notifier-test"
                >
                    {t('settings.project.notifierSlackSendTest')}
                </Button>
                <p className="text-sm text-muted-foreground">
                    {t('settings.project.notifierSlackSendTestHint')}
                </p>
            </div>

            <FieldGroup className="gap-6">
                <Field
                    data-invalid={
                        errors.notifier_telegram_chat_id ? true : undefined
                    }
                >
                    <FieldLabel htmlFor="notifier_telegram_chat_id">
                        {t('settings.project.notifierTelegramChatId')}
                    </FieldLabel>
                    <Input
                        id="notifier_telegram_chat_id"
                        name="notifier_telegram_chat_id"
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        value={form.notifier_telegram_chat_id}
                        onChange={(event) =>
                            setForm((current) => ({
                                ...current,
                                notifier_telegram_chat_id: event.target.value,
                            }))
                        }
                        placeholder="-1001234567890"
                        data-test="project-notifier-telegram-chat-id"
                        aria-invalid={
                            errors.notifier_telegram_chat_id ? true : undefined
                        }
                        aria-describedby={
                            errors.notifier_telegram_chat_id
                                ? 'notifier-telegram-chat-id-error'
                                : undefined
                        }
                    />
                    <FieldError id="notifier-telegram-chat-id-error">
                        {errors.notifier_telegram_chat_id}
                    </FieldError>
                </Field>

                <Field
                    data-invalid={
                        errors.notifier_telegram_bot_token ? true : undefined
                    }
                >
                    <FieldLabel htmlFor="notifier_telegram_bot_token">
                        {t('settings.project.notifierTelegramBotToken')}
                    </FieldLabel>
                    <Input
                        id="notifier_telegram_bot_token"
                        name="notifier_telegram_bot_token"
                        type="password"
                        autoComplete="new-password"
                        value={form.notifier_telegram_bot_token}
                        onChange={(event) =>
                            setForm((current) => ({
                                ...current,
                                notifier_telegram_bot_token: event.target.value,
                            }))
                        }
                        placeholder={
                            project.notifier_telegram_bot_token_configured
                                ? '••••••••'
                                : undefined
                        }
                        data-test="project-notifier-telegram-token"
                        aria-invalid={
                            errors.notifier_telegram_bot_token
                                ? true
                                : undefined
                        }
                        aria-describedby={
                            errors.notifier_telegram_bot_token
                                ? 'notifier-telegram-bot-token-error'
                                : 'notifier-telegram-bot-token-hint'
                        }
                    />
                    <FieldDescription id="notifier-telegram-bot-token-hint">
                        {project.notifier_telegram_bot_token_configured
                            ? t(
                                  'settings.project.notifierTelegramBotTokenConfigured',
                              )
                            : null}{' '}
                        {t('settings.project.notifierTelegramBotTokenHint')}
                    </FieldDescription>
                    <FieldError id="notifier-telegram-bot-token-error">
                        {errors.notifier_telegram_bot_token}
                    </FieldError>
                </Field>
            </FieldGroup>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                    type="button"
                    variant="secondary"
                    disabled={
                        testTelegramNotifier.isPending ||
                        !project.notifier_telegram_chat_id ||
                        !project.notifier_telegram_bot_token_configured
                    }
                    onClick={testTelegramNotifier.send}
                    data-test="project-telegram-notifier-test"
                >
                    {t('settings.project.notifierTelegramSendTest')}
                </Button>
                <p className="text-sm text-muted-foreground">
                    {t('settings.project.notifierTelegramSendTestHint')}
                </p>
            </div>

            <p className="text-sm text-muted-foreground">
                {t('settings.project.notifiersPrivacyNote')}
            </p>
        </div>
    );
}

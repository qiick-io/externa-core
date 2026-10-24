import { Form, Head, router } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import ProjectIntegrationsSettingsController from '@/actions/App/Http/Controllers/Settings/ProjectIntegrationsSettingsController';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { WebhookDeliveryStatus } from '@/components/settings/webhook-deliveries-panel';
import { SettingsFormActions } from '@/components/settings-form-actions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import {
    slackNotifierTest,
    telegramNotifierTest,
    webhookTest,
    edit as editIntegrations,
} from '@/routes/project/integrations';
import type {
    BreadcrumbItem,
    ProjectSettingsForm,
    WebhookDeliverySummary,
    WebhookEventCatalogEntry,
} from '@/types';

type IntegrationsProjectSettings = Pick<
    ProjectSettingsForm,
    | 'webhook_url'
    | 'webhook_secret_configured'
    | 'notifier_slack_webhook_url'
    | 'notifier_telegram_bot_token_configured'
    | 'notifier_telegram_chat_id'
    | 'notifier_event_types'
>;

type Props = {
    project: IntegrationsProjectSettings;
    webhookEvents: WebhookEventCatalogEntry[];
    webhookDeliveries: WebhookDeliverySummary;
};

function buildFormState(project: IntegrationsProjectSettings) {
    return {
        webhook_url: project.webhook_url ?? '',
        webhook_secret: '',
        notifier_slack_webhook_url: project.notifier_slack_webhook_url ?? '',
        notifier_telegram_bot_token: '',
        notifier_telegram_chat_id: project.notifier_telegram_chat_id ?? '',
        notifier_event_types: project.notifier_event_types ?? [],
    };
}

/**
 * Integrations project settings (webhooks + Slack/Telegram notifiers).
 */
export default function ProjectIntegrationsSettingsPage({
    project,
    webhookEvents,
    webhookDeliveries,
}: Props) {
    const { t } = useTranslation();
    const initialForm = useMemo(() => buildFormState(project), [project]);
    const [form, setFormState] = useState(initialForm);
    const [isDirty, setIsDirty] = useState(false);
    const [sendingTestWebhook, setSendingTestWebhook] = useState(false);
    const [sendingTestSlackNotifier, setSendingTestSlackNotifier] =
        useState(false);
    const [sendingTestTelegramNotifier, setSendingTestTelegramNotifier] =
        useState(false);

    const setForm: Dispatch<SetStateAction<typeof initialForm>> = (action) => {
        setIsDirty(true);
        setFormState(action);
    };

    useRegisterUnsavedChanges({
        scope: 'page',
        isDirty,
        onDiscard: () => {
            setFormState(initialForm);
            setIsDirty(false);
        },
    });

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('settings.project.integrationsNav.breadcrumb'),
            href: editIntegrations(),
        },
    ];

    const generateWebhookSecret = (): void => {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        const secret = Array.from(bytes, (byte) =>
            byte.toString(16).padStart(2, '0'),
        ).join('');
        setForm((current) => ({ ...current, webhook_secret: secret }));
    };

    const sendTestWebhook = (): void => {
        setSendingTestWebhook(true);
        router.post(
            webhookTest.url(),
            {},
            {
                preserveScroll: true,
                onFinish: () => setSendingTestWebhook(false),
            },
        );
    };

    const sendTestSlackNotifier = (): void => {
        setSendingTestSlackNotifier(true);
        router.post(
            slackNotifierTest.url(),
            {},
            {
                preserveScroll: true,
                onFinish: () => setSendingTestSlackNotifier(false),
            },
        );
    };

    const sendTestTelegramNotifier = (): void => {
        setSendingTestTelegramNotifier(true);
        router.post(
            telegramNotifierTest.url(),
            {},
            {
                preserveScroll: true,
                onFinish: () => setSendingTestTelegramNotifier(false),
            },
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('settings.project.integrationsNav.head')} />

            <h1 className="sr-only">
                {t('settings.project.integrationsNav.head')}
            </h1>

            <SettingsLayout>
                <Form
                    {...ProjectIntegrationsSettingsController.update.form()}
                    options={{ preserveScroll: true }}
                    className="space-y-10"
                    onSuccess={() => setIsDirty(false)}
                >
                    {({ processing, recentlySuccessful, errors }) => (
                        <>
                            <input
                                type="hidden"
                                name="notifier_event_types"
                                value={JSON.stringify(
                                    form.notifier_event_types,
                                )}
                            />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t('settings.project.webhooksTitle')}
                                    description={t(
                                        'settings.project.webhooksDescription',
                                    )}
                                />

                                <div className="grid gap-2">
                                    <Label htmlFor="webhook_url">
                                        {t('settings.project.webhookUrl')}
                                    </Label>
                                    <Input
                                        id="webhook_url"
                                        name="webhook_url"
                                        type="url"
                                        autoComplete="off"
                                        data-1p-ignore
                                        data-lpignore="true"
                                        value={form.webhook_url}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                webhook_url: event.target.value,
                                            }))
                                        }
                                        placeholder="https://example.com/webhooks/externa"
                                    />
                                    <p className="text-sm text-muted-foreground">
                                        {t('settings.project.webhookUrlHint')}
                                    </p>
                                    <InputError message={errors.webhook_url} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="webhook_secret">
                                        {t('settings.project.webhookSecret')}
                                    </Label>
                                    <div className="flex flex-col gap-2 sm:flex-row">
                                        <Input
                                            id="webhook_secret"
                                            name="webhook_secret"
                                            type="password"
                                            autoComplete="new-password"
                                            value={form.webhook_secret}
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    webhook_secret:
                                                        event.target.value,
                                                }))
                                            }
                                            placeholder={
                                                project.webhook_secret_configured
                                                    ? '••••••••'
                                                    : undefined
                                            }
                                            className="sm:flex-1"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={generateWebhookSecret}
                                        >
                                            {t(
                                                'settings.project.webhookSecretGenerate',
                                            )}
                                        </Button>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {project.webhook_secret_configured
                                            ? t(
                                                  'settings.project.webhookSecretConfigured',
                                              )
                                            : null}{' '}
                                        {t(
                                            'settings.project.webhookSecretHint',
                                        )}
                                    </p>
                                    <InputError
                                        message={errors.webhook_secret}
                                    />
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={
                                            sendingTestWebhook ||
                                            !project.webhook_url ||
                                            !project.webhook_secret_configured
                                        }
                                        onClick={sendTestWebhook}
                                        data-test="project-webhook-test"
                                    >
                                        {t('settings.project.webhookSendTest')}
                                    </Button>
                                    <p className="text-sm text-muted-foreground">
                                        {t(
                                            'settings.project.webhookSendTestHint',
                                        )}
                                    </p>
                                </div>

                                <WebhookDeliveryStatus
                                    deliveries={webhookDeliveries}
                                />
                            </div>

                            <Separator />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t('settings.project.notifiersTitle')}
                                    description={t(
                                        'settings.project.notifiersDescription',
                                    )}
                                />

                                <div className="grid gap-3">
                                    <div className="space-y-1">
                                        <Label>
                                            {t(
                                                'settings.project.notifierEventTypes',
                                            )}
                                        </Label>
                                        <p className="text-sm text-muted-foreground">
                                            {t(
                                                'settings.project.notifierEventTypesHint',
                                            )}
                                        </p>
                                    </div>
                                    <div
                                        className="grid gap-2 sm:grid-cols-2"
                                        data-test="project-notifier-event-types"
                                    >
                                        {webhookEvents
                                            .filter(
                                                (event) =>
                                                    event.type !== 'ping',
                                            )
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
                                                            onCheckedChange={(
                                                                value,
                                                            ) =>
                                                                setForm(
                                                                    (
                                                                        current,
                                                                    ) => {
                                                                        const selected =
                                                                            new Set(
                                                                                current.notifier_event_types,
                                                                            );

                                                                        if (
                                                                            value ===
                                                                            true
                                                                        ) {
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
                                                                    },
                                                                )
                                                            }
                                                        />
                                                        <span className="min-w-0 space-y-0.5">
                                                            <span className="block font-mono text-sm">
                                                                {event.type}
                                                            </span>
                                                            <span className="block text-sm text-muted-foreground">
                                                                {
                                                                    event.description
                                                                }
                                                            </span>
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                    </div>
                                    <InputError
                                        message={
                                            errors.notifier_event_types ??
                                            errors['notifier_event_types.0']
                                        }
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="notifier_slack_webhook_url">
                                        {t(
                                            'settings.project.notifierSlackWebhookUrl',
                                        )}
                                    </Label>
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
                                                notifier_slack_webhook_url:
                                                    event.target.value,
                                            }))
                                        }
                                        placeholder="https://hooks.slack.com/services/…"
                                        data-test="project-notifier-slack-url"
                                    />
                                    <p className="text-sm text-muted-foreground">
                                        {t(
                                            'settings.project.notifierSlackWebhookUrlHint',
                                        )}
                                    </p>
                                    <InputError
                                        message={
                                            errors.notifier_slack_webhook_url
                                        }
                                    />
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={
                                            sendingTestSlackNotifier ||
                                            !project.notifier_slack_webhook_url
                                        }
                                        onClick={sendTestSlackNotifier}
                                        data-test="project-slack-notifier-test"
                                    >
                                        {t(
                                            'settings.project.notifierSlackSendTest',
                                        )}
                                    </Button>
                                    <p className="text-sm text-muted-foreground">
                                        {t(
                                            'settings.project.notifierSlackSendTestHint',
                                        )}
                                    </p>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="notifier_telegram_chat_id">
                                        {t(
                                            'settings.project.notifierTelegramChatId',
                                        )}
                                    </Label>
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
                                                notifier_telegram_chat_id:
                                                    event.target.value,
                                            }))
                                        }
                                        placeholder="-1001234567890"
                                        data-test="project-notifier-telegram-chat-id"
                                    />
                                    <InputError
                                        message={
                                            errors.notifier_telegram_chat_id
                                        }
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="notifier_telegram_bot_token">
                                        {t(
                                            'settings.project.notifierTelegramBotToken',
                                        )}
                                    </Label>
                                    <Input
                                        id="notifier_telegram_bot_token"
                                        name="notifier_telegram_bot_token"
                                        type="password"
                                        autoComplete="new-password"
                                        value={form.notifier_telegram_bot_token}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                notifier_telegram_bot_token:
                                                    event.target.value,
                                            }))
                                        }
                                        placeholder={
                                            project.notifier_telegram_bot_token_configured
                                                ? '••••••••'
                                                : undefined
                                        }
                                        data-test="project-notifier-telegram-token"
                                    />
                                    <p className="text-sm text-muted-foreground">
                                        {project.notifier_telegram_bot_token_configured
                                            ? t(
                                                  'settings.project.notifierTelegramBotTokenConfigured',
                                              )
                                            : null}{' '}
                                        {t(
                                            'settings.project.notifierTelegramBotTokenHint',
                                        )}
                                    </p>
                                    <InputError
                                        message={
                                            errors.notifier_telegram_bot_token
                                        }
                                    />
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={
                                            sendingTestTelegramNotifier ||
                                            !project.notifier_telegram_chat_id ||
                                            !project.notifier_telegram_bot_token_configured
                                        }
                                        onClick={sendTestTelegramNotifier}
                                        data-test="project-telegram-notifier-test"
                                    >
                                        {t(
                                            'settings.project.notifierTelegramSendTest',
                                        )}
                                    </Button>
                                    <p className="text-sm text-muted-foreground">
                                        {t(
                                            'settings.project.notifierTelegramSendTestHint',
                                        )}
                                    </p>
                                </div>

                                <p className="text-sm text-muted-foreground">
                                    {t('settings.project.notifiersPrivacyNote')}
                                </p>
                            </div>

                            <SettingsFormActions
                                processing={processing}
                                recentlySuccessful={recentlySuccessful}
                                isDirty={isDirty}
                                data-test="project-integrations-settings-save"
                            />
                        </>
                    )}
                </Form>
            </SettingsLayout>
        </AppLayout>
    );
}

import { Form, Head, router } from '@inertiajs/react';
import { Plus, Rocket, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import ProjectIntegrationsSettingsController from '@/actions/App/Http/Controllers/Settings/ProjectIntegrationsSettingsController';
import Heading from '@/components/heading';
import { WebhookDeliveryStatus } from '@/components/settings/webhook-deliveries-panel';
import { SettingsFormActions } from '@/components/settings-form-actions';
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
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import {
    deploy as deployRoute,
    slackNotifierTest,
    telegramNotifierTest,
    webhookTest,
    edit as editIntegrations,
} from '@/routes/project/integrations';
import type {
    BreadcrumbItem,
    DeployLastRun,
    ProjectSettingsForm,
    WebhookDeliverySummary,
    WebhookEventCatalogEntry,
} from '@/types';

type DeployHookDraft = {
    clientKey: string;
    id?: string;
    name: string;
    url: string;
    url_configured: boolean;
};

type IntegrationsProjectSettings = Pick<
    ProjectSettingsForm,
    | 'webhook_url'
    | 'webhook_secret_configured'
    | 'notifier_slack_webhook_url'
    | 'notifier_telegram_bot_token_configured'
    | 'notifier_telegram_chat_id'
    | 'notifier_event_types'
    | 'deploy_hooks'
    | 'deploy_on_publish'
>;

type IntegrationsFormState = {
    webhook_url: string;
    webhook_secret: string;
    notifier_slack_webhook_url: string;
    notifier_telegram_bot_token: string;
    notifier_telegram_chat_id: string;
    notifier_event_types: string[];
    deploy_hooks: DeployHookDraft[];
    deploy_on_publish: boolean;
};

type Props = {
    project: IntegrationsProjectSettings;
    webhookEvents: WebhookEventCatalogEntry[];
    webhookDeliveries: WebhookDeliverySummary;
    deployLastRun: DeployLastRun | null;
};

function buildFormState(
    project: IntegrationsProjectSettings,
): IntegrationsFormState {
    return {
        webhook_url: project.webhook_url ?? '',
        webhook_secret: '',
        notifier_slack_webhook_url: project.notifier_slack_webhook_url ?? '',
        notifier_telegram_bot_token: '',
        notifier_telegram_chat_id: project.notifier_telegram_chat_id ?? '',
        notifier_event_types: project.notifier_event_types ?? [],
        deploy_hooks: (project.deploy_hooks ?? []).map(
            (hook, index): DeployHookDraft => ({
                clientKey: hook.id || `new-${index}`,
                id: hook.id,
                name: hook.name,
                url: '',
                url_configured: hook.url_configured,
            }),
        ),
        deploy_on_publish: project.deploy_on_publish ?? false,
    };
}

/**
 * Integrations project settings (webhooks + Slack/Telegram notifiers).
 */
export default function ProjectIntegrationsSettingsPage({
    project,
    webhookEvents,
    webhookDeliveries,
    deployLastRun,
}: Props) {
    const { t } = useTranslation();
    const { can } = useCan();
    const initialForm = useMemo(() => buildFormState(project), [project]);
    const [form, setFormState] = useState<IntegrationsFormState>(initialForm);
    const [isDirty, setIsDirty] = useState(false);
    const [sendingTestWebhook, setSendingTestWebhook] = useState(false);
    const [sendingTestSlackNotifier, setSendingTestSlackNotifier] =
        useState(false);
    const [sendingTestTelegramNotifier, setSendingTestTelegramNotifier] =
        useState(false);
    const [isDeploying, setIsDeploying] = useState(false);
    const canTriggerDeploy = can(PermissionEnum.DeployTrigger);

    const setForm: Dispatch<SetStateAction<IntegrationsFormState>> = (
        action,
    ) => {
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

    const triggerDeploy = (): void => {
        setIsDeploying(true);
        router.post(
            deployRoute.url(),
            {},
            {
                preserveScroll: true,
                onFinish: () => setIsDeploying(false),
            },
        );
    };

    const addDeployHook = (): void => {
        if (form.deploy_hooks.length >= 10) {
            return;
        }

        setForm((current) => ({
            ...current,
            deploy_hooks: [
                ...current.deploy_hooks,
                {
                    clientKey: `new-${Date.now()}`,
                    name: '',
                    url: '',
                    url_configured: false,
                },
            ],
        }));
    };

    const updateDeployHook = (
        clientKey: string,
        patch: Partial<DeployHookDraft>,
    ): void => {
        setForm((current) => ({
            ...current,
            deploy_hooks: current.deploy_hooks.map((hook) =>
                hook.clientKey === clientKey ? { ...hook, ...patch } : hook,
            ),
        }));
    };

    const removeDeployHook = (clientKey: string): void => {
        setForm((current) => ({
            ...current,
            deploy_hooks: current.deploy_hooks.filter(
                (hook) => hook.clientKey !== clientKey,
            ),
        }));
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
                    className="space-y-12"
                    onSuccess={() => setIsDirty(false)}
                    noValidate
                >
                    {({ processing, recentlySuccessful, errors }) => {
                        const notifierEventTypesError =
                            errors.notifier_event_types ??
                            errors['notifier_event_types.0'];

                        return (
                            <>
                                <input
                                    type="hidden"
                                    name="notifier_event_types"
                                    value={JSON.stringify(
                                        form.notifier_event_types,
                                    )}
                                />
                                <input
                                    type="hidden"
                                    name="deploy_hooks"
                                    value={JSON.stringify(
                                        form.deploy_hooks.map((hook) => ({
                                            id: hook.id,
                                            name: hook.name,
                                            url: hook.url,
                                        })),
                                    )}
                                />
                                <input
                                    type="hidden"
                                    name="deploy_on_publish"
                                    value={form.deploy_on_publish ? '1' : '0'}
                                />

                                <div className="space-y-6">
                                    <Heading
                                        variant="small"
                                        title={t(
                                            'settings.project.webhooksTitle',
                                        )}
                                        description={t(
                                            'settings.project.webhooksDescription',
                                        )}
                                    />

                                    <FieldGroup className="gap-6">
                                        <Field
                                            data-invalid={
                                                errors.webhook_url
                                                    ? true
                                                    : undefined
                                            }
                                        >
                                            <FieldLabel htmlFor="webhook_url">
                                                {t(
                                                    'settings.project.webhookUrl',
                                                )}
                                            </FieldLabel>
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
                                                        webhook_url:
                                                            event.target.value,
                                                    }))
                                                }
                                                placeholder="https://example.com/webhooks/externa"
                                                aria-invalid={
                                                    errors.webhook_url
                                                        ? true
                                                        : undefined
                                                }
                                                aria-describedby={
                                                    errors.webhook_url
                                                        ? 'webhook-url-error'
                                                        : 'webhook-url-hint'
                                                }
                                            />
                                            <FieldDescription id="webhook-url-hint">
                                                {t(
                                                    'settings.project.webhookUrlHint',
                                                )}
                                            </FieldDescription>
                                            <FieldError id="webhook-url-error">
                                                {errors.webhook_url}
                                            </FieldError>
                                        </Field>

                                        <Field
                                            data-invalid={
                                                errors.webhook_secret
                                                    ? true
                                                    : undefined
                                            }
                                        >
                                            <FieldLabel htmlFor="webhook_secret">
                                                {t(
                                                    'settings.project.webhookSecret',
                                                )}
                                            </FieldLabel>
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
                                                                event.target
                                                                    .value,
                                                        }))
                                                    }
                                                    placeholder={
                                                        project.webhook_secret_configured
                                                            ? '••••••••'
                                                            : undefined
                                                    }
                                                    className="sm:flex-1"
                                                    aria-invalid={
                                                        errors.webhook_secret
                                                            ? true
                                                            : undefined
                                                    }
                                                    aria-describedby={
                                                        errors.webhook_secret
                                                            ? 'webhook-secret-error'
                                                            : 'webhook-secret-hint'
                                                    }
                                                />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={
                                                        generateWebhookSecret
                                                    }
                                                >
                                                    {t(
                                                        'settings.project.webhookSecretGenerate',
                                                    )}
                                                </Button>
                                            </div>
                                            <FieldDescription id="webhook-secret-hint">
                                                {project.webhook_secret_configured
                                                    ? t(
                                                          'settings.project.webhookSecretConfigured',
                                                      )
                                                    : null}{' '}
                                                {t(
                                                    'settings.project.webhookSecretHint',
                                                )}
                                            </FieldDescription>
                                            <FieldError id="webhook-secret-error">
                                                {errors.webhook_secret}
                                            </FieldError>
                                        </Field>
                                    </FieldGroup>

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
                                            {t(
                                                'settings.project.webhookSendTest',
                                            )}
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
                                        title={t(
                                            'settings.project.notifiersTitle',
                                        )}
                                        description={t(
                                            'settings.project.notifiersDescription',
                                        )}
                                    />

                                    <FieldGroup className="gap-6">
                                        <Field
                                            data-invalid={
                                                notifierEventTypesError
                                                    ? true
                                                    : undefined
                                            }
                                        >
                                            <div className="space-y-1">
                                                <FieldLabel>
                                                    {t(
                                                        'settings.project.notifierEventTypes',
                                                    )}
                                                </FieldLabel>
                                                <FieldDescription>
                                                    {t(
                                                        'settings.project.notifierEventTypesHint',
                                                    )}
                                                </FieldDescription>
                                            </div>
                                            <div
                                                className="grid gap-2 sm:grid-cols-2"
                                                data-test="project-notifier-event-types"
                                            >
                                                {webhookEvents
                                                    .filter(
                                                        (event) =>
                                                            event.type !==
                                                            'ping',
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
                                                                    checked={
                                                                        checked
                                                                    }
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
                                                                        {
                                                                            event.type
                                                                        }
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
                                            <FieldError id="notifier-event-types-error">
                                                {notifierEventTypesError}
                                            </FieldError>
                                        </Field>

                                        <Field
                                            data-invalid={
                                                errors.notifier_slack_webhook_url
                                                    ? true
                                                    : undefined
                                            }
                                        >
                                            <FieldLabel htmlFor="notifier_slack_webhook_url">
                                                {t(
                                                    'settings.project.notifierSlackWebhookUrl',
                                                )}
                                            </FieldLabel>
                                            <Input
                                                id="notifier_slack_webhook_url"
                                                name="notifier_slack_webhook_url"
                                                type="url"
                                                autoComplete="off"
                                                data-1p-ignore
                                                data-lpignore="true"
                                                value={
                                                    form.notifier_slack_webhook_url
                                                }
                                                onChange={(event) =>
                                                    setForm((current) => ({
                                                        ...current,
                                                        notifier_slack_webhook_url:
                                                            event.target.value,
                                                    }))
                                                }
                                                placeholder="https://hooks.slack.com/services/…"
                                                data-test="project-notifier-slack-url"
                                                aria-invalid={
                                                    errors.notifier_slack_webhook_url
                                                        ? true
                                                        : undefined
                                                }
                                                aria-describedby={
                                                    errors.notifier_slack_webhook_url
                                                        ? 'notifier-slack-webhook-url-error'
                                                        : 'notifier-slack-webhook-url-hint'
                                                }
                                            />
                                            <FieldDescription id="notifier-slack-webhook-url-hint">
                                                {t(
                                                    'settings.project.notifierSlackWebhookUrlHint',
                                                )}
                                            </FieldDescription>
                                            <FieldError id="notifier-slack-webhook-url-error">
                                                {
                                                    errors.notifier_slack_webhook_url
                                                }
                                            </FieldError>
                                        </Field>
                                    </FieldGroup>

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

                                    <FieldGroup className="gap-6">
                                        <Field
                                            data-invalid={
                                                errors.notifier_telegram_chat_id
                                                    ? true
                                                    : undefined
                                            }
                                        >
                                            <FieldLabel htmlFor="notifier_telegram_chat_id">
                                                {t(
                                                    'settings.project.notifierTelegramChatId',
                                                )}
                                            </FieldLabel>
                                            <Input
                                                id="notifier_telegram_chat_id"
                                                name="notifier_telegram_chat_id"
                                                autoComplete="off"
                                                data-1p-ignore
                                                data-lpignore="true"
                                                value={
                                                    form.notifier_telegram_chat_id
                                                }
                                                onChange={(event) =>
                                                    setForm((current) => ({
                                                        ...current,
                                                        notifier_telegram_chat_id:
                                                            event.target.value,
                                                    }))
                                                }
                                                placeholder="-1001234567890"
                                                data-test="project-notifier-telegram-chat-id"
                                                aria-invalid={
                                                    errors.notifier_telegram_chat_id
                                                        ? true
                                                        : undefined
                                                }
                                                aria-describedby={
                                                    errors.notifier_telegram_chat_id
                                                        ? 'notifier-telegram-chat-id-error'
                                                        : undefined
                                                }
                                            />
                                            <FieldError id="notifier-telegram-chat-id-error">
                                                {
                                                    errors.notifier_telegram_chat_id
                                                }
                                            </FieldError>
                                        </Field>

                                        <Field
                                            data-invalid={
                                                errors.notifier_telegram_bot_token
                                                    ? true
                                                    : undefined
                                            }
                                        >
                                            <FieldLabel htmlFor="notifier_telegram_bot_token">
                                                {t(
                                                    'settings.project.notifierTelegramBotToken',
                                                )}
                                            </FieldLabel>
                                            <Input
                                                id="notifier_telegram_bot_token"
                                                name="notifier_telegram_bot_token"
                                                type="password"
                                                autoComplete="new-password"
                                                value={
                                                    form.notifier_telegram_bot_token
                                                }
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
                                                {t(
                                                    'settings.project.notifierTelegramBotTokenHint',
                                                )}
                                            </FieldDescription>
                                            <FieldError id="notifier-telegram-bot-token-error">
                                                {
                                                    errors.notifier_telegram_bot_token
                                                }
                                            </FieldError>
                                        </Field>
                                    </FieldGroup>

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
                                        {t(
                                            'settings.project.notifiersPrivacyNote',
                                        )}
                                    </p>
                                </div>

                                <Separator />

                                <div className="space-y-6">
                                    <Heading
                                        variant="small"
                                        title={t(
                                            'settings.project.deployTitle',
                                        )}
                                        description={t(
                                            'settings.project.deployDescription',
                                        )}
                                    />

                                    <div className="space-y-4">
                                        {form.deploy_hooks.map(
                                            (hook, index) => (
                                                <div
                                                    key={hook.clientKey}
                                                    className="space-y-3 rounded-md border border-border/60 p-4"
                                                    data-test={`deploy-hook-row-${index}`}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <p className="text-sm font-medium">
                                                            {t(
                                                                'settings.project.deployHookLabel',
                                                                {
                                                                    number:
                                                                        index +
                                                                        1,
                                                                },
                                                            )}
                                                        </p>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon-sm"
                                                            onClick={() =>
                                                                removeDeployHook(
                                                                    hook.clientKey,
                                                                )
                                                            }
                                                            aria-label={t(
                                                                'settings.project.deployHookRemove',
                                                            )}
                                                        >
                                                            <Trash2 className="size-4" />
                                                        </Button>
                                                    </div>
                                                    <FieldGroup className="gap-4">
                                                        <Field
                                                            data-invalid={
                                                                errors[
                                                                    `deploy_hooks.${index}.name`
                                                                ]
                                                                    ? true
                                                                    : undefined
                                                            }
                                                        >
                                                            <FieldLabel
                                                                htmlFor={`deploy_hook_name_${hook.clientKey}`}
                                                            >
                                                                {t(
                                                                    'settings.project.deployHookName',
                                                                )}
                                                            </FieldLabel>
                                                            <Input
                                                                id={`deploy_hook_name_${hook.clientKey}`}
                                                                value={
                                                                    hook.name
                                                                }
                                                                onChange={(
                                                                    event,
                                                                ) =>
                                                                    updateDeployHook(
                                                                        hook.clientKey,
                                                                        {
                                                                            name: event
                                                                                .target
                                                                                .value,
                                                                        },
                                                                    )
                                                                }
                                                                placeholder="Production"
                                                                aria-invalid={
                                                                    errors[
                                                                        `deploy_hooks.${index}.name`
                                                                    ]
                                                                        ? true
                                                                        : undefined
                                                                }
                                                            />
                                                            <FieldError>
                                                                {
                                                                    errors[
                                                                        `deploy_hooks.${index}.name`
                                                                    ]
                                                                }
                                                            </FieldError>
                                                        </Field>
                                                        <Field
                                                            data-invalid={
                                                                errors[
                                                                    `deploy_hooks.${index}.url`
                                                                ]
                                                                    ? true
                                                                    : undefined
                                                            }
                                                        >
                                                            <FieldLabel
                                                                htmlFor={`deploy_hook_url_${hook.clientKey}`}
                                                            >
                                                                {t(
                                                                    'settings.project.deployHookUrl',
                                                                )}
                                                            </FieldLabel>
                                                            <Input
                                                                id={`deploy_hook_url_${hook.clientKey}`}
                                                                type="url"
                                                                autoComplete="off"
                                                                data-1p-ignore
                                                                data-lpignore="true"
                                                                value={hook.url}
                                                                onChange={(
                                                                    event,
                                                                ) =>
                                                                    updateDeployHook(
                                                                        hook.clientKey,
                                                                        {
                                                                            url: event
                                                                                .target
                                                                                .value,
                                                                        },
                                                                    )
                                                                }
                                                                placeholder={
                                                                    hook.url_configured
                                                                        ? '••••••••'
                                                                        : 'https://api.vercel.com/v1/integrations/deploy/…'
                                                                }
                                                                aria-invalid={
                                                                    errors[
                                                                        `deploy_hooks.${index}.url`
                                                                    ]
                                                                        ? true
                                                                        : undefined
                                                                }
                                                                aria-describedby={`deploy-hook-url-hint-${hook.clientKey}`}
                                                            />
                                                            <FieldDescription
                                                                id={`deploy-hook-url-hint-${hook.clientKey}`}
                                                            >
                                                                {hook.url_configured
                                                                    ? t(
                                                                          'settings.project.deployHookUrlConfigured',
                                                                      )
                                                                    : t(
                                                                          'settings.project.deployHookUrlHint',
                                                                      )}
                                                            </FieldDescription>
                                                            <FieldError>
                                                                {
                                                                    errors[
                                                                        `deploy_hooks.${index}.url`
                                                                    ]
                                                                }
                                                            </FieldError>
                                                        </Field>
                                                    </FieldGroup>
                                                </div>
                                            ),
                                        )}
                                    </div>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={
                                            form.deploy_hooks.length >= 10
                                        }
                                        onClick={addDeployHook}
                                        data-test="deploy-hook-add"
                                    >
                                        <Plus className="size-4" aria-hidden />
                                        {t('settings.project.deployHookAdd')}
                                    </Button>

                                    <Field className="flex flex-row items-center gap-3">
                                        <Switch
                                            id="deploy_on_publish"
                                            checked={form.deploy_on_publish}
                                            onCheckedChange={(checked) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    deploy_on_publish: checked,
                                                }))
                                            }
                                            data-test="deploy-on-publish"
                                        />
                                        <div className="space-y-1">
                                            <FieldLabel htmlFor="deploy_on_publish">
                                                {t(
                                                    'settings.project.deployOnPublish',
                                                )}
                                            </FieldLabel>
                                            <FieldDescription>
                                                {t(
                                                    'settings.project.deployOnPublishHint',
                                                )}
                                            </FieldDescription>
                                        </div>
                                    </Field>

                                    {canTriggerDeploy ? (
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                disabled={
                                                    isDeploying ||
                                                    form.deploy_hooks.length ===
                                                        0
                                                }
                                                onClick={triggerDeploy}
                                                data-test="project-deploy-trigger"
                                            >
                                                <Rocket
                                                    className="size-4"
                                                    aria-hidden
                                                />
                                                {t(
                                                    'settings.project.deployTrigger',
                                                )}
                                            </Button>
                                            <p className="text-sm text-muted-foreground">
                                                {t(
                                                    'settings.project.deployTriggerHint',
                                                )}
                                            </p>
                                        </div>
                                    ) : null}

                                    <div
                                        className="space-y-1 rounded-md border p-3"
                                        data-test="deploy-last-run"
                                    >
                                        <p className="text-sm font-medium">
                                            {t(
                                                'settings.project.deployLastRunTitle',
                                            )}
                                        </p>
                                        {deployLastRun === null ? (
                                            <p className="text-sm text-muted-foreground">
                                                {t(
                                                    'settings.project.deployLastRunNone',
                                                )}
                                            </p>
                                        ) : (
                                            <>
                                                <p className="text-sm">
                                                    <span className="font-medium">
                                                        {
                                                            deployLastRun.hook_name
                                                        }
                                                    </span>{' '}
                                                    <span className="text-muted-foreground">
                                                        ·{' '}
                                                        {new Date(
                                                            deployLastRun.at,
                                                        ).toLocaleString()}
                                                    </span>
                                                </p>
                                                <p className="font-mono text-xs text-muted-foreground">
                                                    {deployLastRun.outcome}
                                                    {deployLastRun.status !==
                                                    null
                                                        ? ` · HTTP ${deployLastRun.status}`
                                                        : ''}
                                                    {` · ${deployLastRun.source}`}
                                                </p>
                                                {deployLastRun.message ? (
                                                    <p className="text-sm break-words text-destructive">
                                                        {deployLastRun.message}
                                                    </p>
                                                ) : null}
                                            </>
                                        )}
                                    </div>
                                </div>

                                <SettingsFormActions
                                    processing={processing}
                                    recentlySuccessful={recentlySuccessful}
                                    isDirty={isDirty}
                                    data-test="project-integrations-settings-save"
                                />
                            </>
                        );
                    }}
                </Form>
            </SettingsLayout>
        </AppLayout>
    );
}

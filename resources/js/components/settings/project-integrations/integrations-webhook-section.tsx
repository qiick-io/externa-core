import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import Heading from '@/components/heading';
import { WebhookDeliveryStatus } from '@/components/settings/webhook-deliveries-panel';
import { Button } from '@/components/ui/button';
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
import { webhookTest } from '@/routes/project/integrations';
import type { WebhookDeliverySummary } from '@/types';

/**
 * Outgoing webhook URL and signing secret, the "send test" action and the recent
 * delivery status.
 */
export function IntegrationsWebhookSection({
    form,
    setForm,
    errors,
    project,
    webhookDeliveries,
}: {
    form: IntegrationsFormState;
    setForm: Dispatch<SetStateAction<IntegrationsFormState>>;
    errors: Record<string, string | undefined>;
    project: IntegrationsProjectSettings;
    webhookDeliveries: WebhookDeliverySummary;
}) {
    const { t } = useTranslation();
    const testWebhook = usePendingRouterPost(webhookTest.url());

    const generateWebhookSecret = (): void => {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        const secret = Array.from(bytes, (byte) =>
            byte.toString(16).padStart(2, '0'),
        ).join('');
        setForm((current) => ({ ...current, webhook_secret: secret }));
    };

    return (
        <div className="space-y-6">
            <Heading
                variant="small"
                title={t('settings.project.webhooksTitle')}
                description={t('settings.project.webhooksDescription')}
            />

            <FieldGroup className="gap-6">
                <Field data-invalid={errors.webhook_url ? true : undefined}>
                    <FieldLabel htmlFor="webhook_url">
                        {t('settings.project.webhookUrl')}
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
                                webhook_url: event.target.value,
                            }))
                        }
                        placeholder="https://example.com/webhooks/externa"
                        aria-invalid={errors.webhook_url ? true : undefined}
                        aria-describedby={
                            errors.webhook_url
                                ? 'webhook-url-error'
                                : 'webhook-url-hint'
                        }
                    />
                    <FieldDescription id="webhook-url-hint">
                        {t('settings.project.webhookUrlHint')}
                    </FieldDescription>
                    <FieldError id="webhook-url-error">
                        {errors.webhook_url}
                    </FieldError>
                </Field>

                <Field data-invalid={errors.webhook_secret ? true : undefined}>
                    <FieldLabel htmlFor="webhook_secret">
                        {t('settings.project.webhookSecret')}
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
                                    webhook_secret: event.target.value,
                                }))
                            }
                            placeholder={
                                project.webhook_secret_configured
                                    ? '••••••••'
                                    : undefined
                            }
                            className="sm:flex-1"
                            aria-invalid={
                                errors.webhook_secret ? true : undefined
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
                            onClick={generateWebhookSecret}
                        >
                            {t('settings.project.webhookSecretGenerate')}
                        </Button>
                    </div>
                    <FieldDescription id="webhook-secret-hint">
                        {project.webhook_secret_configured
                            ? t('settings.project.webhookSecretConfigured')
                            : null}{' '}
                        {t('settings.project.webhookSecretHint')}
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
                        testWebhook.isPending ||
                        !project.webhook_url ||
                        !project.webhook_secret_configured
                    }
                    onClick={testWebhook.send}
                    data-test="project-webhook-test"
                >
                    {t('settings.project.webhookSendTest')}
                </Button>
                <p className="text-sm text-muted-foreground">
                    {t('settings.project.webhookSendTestHint')}
                </p>
            </div>

            <WebhookDeliveryStatus deliveries={webhookDeliveries} />
        </div>
    );
}

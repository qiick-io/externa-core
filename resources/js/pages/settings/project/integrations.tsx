import { Form, Head } from '@inertiajs/react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ProjectIntegrationsSettingsController from '@/actions/App/Http/Controllers/Settings/ProjectIntegrationsSettingsController';
import { buildFormState } from '@/components/settings/project-integrations/integrations-form-state';
import type {
    IntegrationsFormState,
    IntegrationsProjectSettings,
} from '@/components/settings/project-integrations/integrations-form-state';
import { IntegrationsDeploySection } from '@/components/settings/project-integrations/integrations-deploy-section';
import { IntegrationsNotifiersSection } from '@/components/settings/project-integrations/integrations-notifiers-section';
import { IntegrationsWebhookSection } from '@/components/settings/project-integrations/integrations-webhook-section';
import { SettingsFormActions } from '@/components/settings-form-actions';
import { Separator } from '@/components/ui/separator';
import { useSettingsFormState } from '@/hooks/use-settings-form-state';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { edit as editIntegrations } from '@/routes/project/integrations';
import type {
    BreadcrumbItem,
    DeployLastRun,
    WebhookDeliverySummary,
    WebhookEventCatalogEntry,
} from '@/types';

type Props = {
    project: IntegrationsProjectSettings;
    webhookEvents: WebhookEventCatalogEntry[];
    webhookDeliveries: WebhookDeliverySummary;
    deployLastRun: DeployLastRun | null;
};

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
    const initialForm = useMemo(() => buildFormState(project), [project]);
    const { form, setForm, isDirty, markSaved } =
        useSettingsFormState<IntegrationsFormState>(initialForm);

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('settings.project.integrationsNav.breadcrumb'),
            href: editIntegrations(),
        },
    ];

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
                    onSuccess={markSaved}
                    noValidate
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

                            <IntegrationsWebhookSection
                                form={form}
                                setForm={setForm}
                                errors={errors}
                                project={project}
                                webhookDeliveries={webhookDeliveries}
                            />

                            <Separator />

                            <IntegrationsNotifiersSection
                                form={form}
                                setForm={setForm}
                                errors={errors}
                                project={project}
                                webhookEvents={webhookEvents}
                            />

                            <Separator />

                            <IntegrationsDeploySection
                                form={form}
                                setForm={setForm}
                                errors={errors}
                                deployLastRun={deployLastRun}
                            />

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

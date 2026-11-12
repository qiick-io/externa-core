import { Plus, Rocket, Trash2 } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { usePendingRouterPost } from '@/components/settings/project-integrations/use-pending-router-post';
import type {
    DeployHookDraft,
    IntegrationsFormState,
} from '@/components/settings/project-integrations/integrations-form-state';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { deploy as deployRoute } from '@/routes/project/integrations';
import type { DeployLastRun } from '@/types';

/**
 * Deploy hooks (at most 10), deploy on publish, the manual deploy trigger for users with
 * the deploy permission, and the outcome of the last run.
 */
export function IntegrationsDeploySection({
    form,
    setForm,
    errors,
    deployLastRun,
}: {
    form: IntegrationsFormState;
    setForm: Dispatch<SetStateAction<IntegrationsFormState>>;
    errors: Record<string, string | undefined>;
    deployLastRun: DeployLastRun | null;
}) {
    const { t } = useTranslation();
    const { can } = useCan();
    const deployTrigger = usePendingRouterPost(deployRoute.url());
    const canTriggerDeploy = can(PermissionEnum.DeployTrigger);

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
        <div className="space-y-6">
            <Heading
                variant="small"
                title={t('settings.project.deployTitle')}
                description={t('settings.project.deployDescription')}
            />

            <div className="space-y-4">
                {form.deploy_hooks.map((hook, index) => (
                    <div
                        key={hook.clientKey}
                        className="space-y-3 rounded-md border border-border/60 p-4"
                        data-test={`deploy-hook-row-${index}`}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium">
                                {t('settings.project.deployHookLabel', {
                                    number: index + 1,
                                })}
                            </p>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeDeployHook(hook.clientKey)}
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
                                    errors[`deploy_hooks.${index}.name`]
                                        ? true
                                        : undefined
                                }
                            >
                                <FieldLabel
                                    htmlFor={`deploy_hook_name_${hook.clientKey}`}
                                >
                                    {t('settings.project.deployHookName')}
                                </FieldLabel>
                                <Input
                                    id={`deploy_hook_name_${hook.clientKey}`}
                                    value={hook.name}
                                    onChange={(event) =>
                                        updateDeployHook(hook.clientKey, {
                                            name: event.target.value,
                                        })
                                    }
                                    placeholder={t(
                                        'settings.project.deployHookNamePlaceholder',
                                    )}
                                    aria-invalid={
                                        errors[`deploy_hooks.${index}.name`]
                                            ? true
                                            : undefined
                                    }
                                />
                                <FieldError>
                                    {errors[`deploy_hooks.${index}.name`]}
                                </FieldError>
                            </Field>
                            <Field
                                data-invalid={
                                    errors[`deploy_hooks.${index}.url`]
                                        ? true
                                        : undefined
                                }
                            >
                                <FieldLabel
                                    htmlFor={`deploy_hook_url_${hook.clientKey}`}
                                >
                                    {t('settings.project.deployHookUrl')}
                                </FieldLabel>
                                <Input
                                    id={`deploy_hook_url_${hook.clientKey}`}
                                    type="url"
                                    autoComplete="off"
                                    data-1p-ignore
                                    data-lpignore="true"
                                    value={hook.url}
                                    onChange={(event) =>
                                        updateDeployHook(hook.clientKey, {
                                            url: event.target.value,
                                        })
                                    }
                                    placeholder={
                                        hook.url_configured
                                            ? '••••••••'
                                            : 'https://api.vercel.com/v1/integrations/deploy/…'
                                    }
                                    aria-invalid={
                                        errors[`deploy_hooks.${index}.url`]
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
                                    {errors[`deploy_hooks.${index}.url`]}
                                </FieldError>
                            </Field>
                        </FieldGroup>
                    </div>
                ))}
            </div>

            <Button
                type="button"
                variant="outline"
                disabled={form.deploy_hooks.length >= 10}
                onClick={addDeployHook}
                data-test="deploy-hook-add"
            >
                <Plus className="size-4" aria-hidden />
                {t('settings.project.deployHookAdd')}
            </Button>

            <Field orientation="horizontal">
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
                <div className="grid gap-1">
                    <FieldLabel htmlFor="deploy_on_publish">
                        {t('settings.project.deployOnPublish')}
                    </FieldLabel>
                    <FieldDescription>
                        {t('settings.project.deployOnPublishHint')}
                    </FieldDescription>
                </div>
            </Field>

            {canTriggerDeploy ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button
                        type="button"
                        variant="secondary"
                        disabled={
                            deployTrigger.isPending ||
                            form.deploy_hooks.length === 0
                        }
                        onClick={deployTrigger.send}
                        data-test="project-deploy-trigger"
                    >
                        <Rocket className="size-4" aria-hidden />
                        {t('settings.project.deployTrigger')}
                    </Button>
                    <p className="text-sm text-muted-foreground">
                        {t('settings.project.deployTriggerHint')}
                    </p>
                </div>
            ) : null}

            <div
                className="space-y-1 rounded-md border p-3"
                data-test="deploy-last-run"
            >
                <p className="text-sm font-medium">
                    {t('settings.project.deployLastRunTitle')}
                </p>
                {deployLastRun === null ? (
                    <p className="text-sm text-muted-foreground">
                        {t('settings.project.deployLastRunNone')}
                    </p>
                ) : (
                    <>
                        <p className="text-sm">
                            <span className="font-medium">
                                {deployLastRun.hook_name}
                            </span>{' '}
                            <span className="text-muted-foreground">
                                · {new Date(deployLastRun.at).toLocaleString()}
                            </span>
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                            {deployLastRun.outcome}
                            {deployLastRun.status !== null
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
    );
}

import { Form, Head } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import ProjectContentSettingsController from '@/actions/App/Http/Controllers/Settings/ProjectContentSettingsController';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { SettingsFormActions } from '@/components/settings-form-actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { edit as editContent } from '@/routes/project/content';
import type { BreadcrumbItem, ProjectSettingsForm } from '@/types';

type ContentProjectSettings = Pick<
    ProjectSettingsForm,
    | 'revision_retention_count'
    | 'revision_retention_days'
    | 'preview_url_default'
>;

type Props = {
    project: ContentProjectSettings;
};

function buildFormState(project: ContentProjectSettings) {
    return {
        preview_url_default: project.preview_url_default ?? '',
        revision_retention_count: project.revision_retention_count ?? null,
        revision_retention_days: project.revision_retention_days ?? null,
    };
}

/**
 * Content project settings (revision retention + live preview).
 */
export default function ProjectContentSettingsPage({ project }: Props) {
    const { t } = useTranslation();
    const initialForm = useMemo(() => buildFormState(project), [project]);
    const [form, setFormState] = useState(initialForm);
    const [isDirty, setIsDirty] = useState(false);

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
            title: t('settings.project.contentNav.breadcrumb'),
            href: editContent(),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('settings.project.contentNav.head')} />

            <h1 className="sr-only">{t('settings.project.contentNav.head')}</h1>

            <SettingsLayout>
                <Form
                    {...ProjectContentSettingsController.update.form()}
                    options={{ preserveScroll: true }}
                    className="space-y-10"
                    onSuccess={() => setIsDirty(false)}
                >
                    {({ processing, recentlySuccessful, errors }) => (
                        <>
                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t(
                                        'settings.project.revisionRetentionTitle',
                                    )}
                                    description={t(
                                        'settings.project.revisionRetentionDescription',
                                    )}
                                />

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label htmlFor="revision_retention_count">
                                            {t(
                                                'settings.project.revisionRetentionCount',
                                            )}
                                        </Label>
                                        <Input
                                            id="revision_retention_count"
                                            name="revision_retention_count"
                                            type="number"
                                            min={1}
                                            max={10000}
                                            value={
                                                form.revision_retention_count ??
                                                ''
                                            }
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    revision_retention_count:
                                                        event.target.value ===
                                                        ''
                                                            ? null
                                                            : Number(
                                                                  event.target
                                                                      .value,
                                                              ),
                                                }))
                                            }
                                        />
                                        <InputError
                                            message={
                                                errors.revision_retention_count
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="revision_retention_days">
                                            {t(
                                                'settings.project.revisionRetentionDays',
                                            )}
                                        </Label>
                                        <Input
                                            id="revision_retention_days"
                                            name="revision_retention_days"
                                            type="number"
                                            min={1}
                                            max={3650}
                                            value={
                                                form.revision_retention_days ??
                                                ''
                                            }
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    revision_retention_days:
                                                        event.target.value ===
                                                        ''
                                                            ? null
                                                            : Number(
                                                                  event.target
                                                                      .value,
                                                              ),
                                                }))
                                            }
                                        />
                                        <InputError
                                            message={
                                                errors.revision_retention_days
                                            }
                                        />
                                    </div>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {t(
                                        'settings.project.revisionRetentionHint',
                                    )}
                                </p>
                            </div>

                            <Separator />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t(
                                        'settings.project.previewUrlDefault',
                                    )}
                                    description={t(
                                        'settings.project.previewUrlDefaultHint',
                                    )}
                                />

                                <div className="grid gap-2">
                                    <Label htmlFor="preview_url_default">
                                        {t(
                                            'settings.project.previewUrlDefault',
                                        )}
                                    </Label>
                                    <Input
                                        id="preview_url_default"
                                        name="preview_url_default"
                                        type="url"
                                        autoComplete="off"
                                        data-1p-ignore
                                        data-lpignore="true"
                                        value={form.preview_url_default}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                preview_url_default:
                                                    event.target.value,
                                            }))
                                        }
                                        placeholder="https://example.com/preview/{{collection}}/{{id}}?token={{token}}"
                                        data-test="project-preview-url-default"
                                    />
                                    <InputError
                                        message={errors.preview_url_default}
                                    />
                                </div>
                            </div>

                            <SettingsFormActions
                                processing={processing}
                                recentlySuccessful={recentlySuccessful}
                                isDirty={isDirty}
                                data-test="project-content-settings-save"
                            />
                        </>
                    )}
                </Form>
            </SettingsLayout>
        </AppLayout>
    );
}

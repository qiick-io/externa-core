import { Form, Head } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import ProjectContentSettingsController from '@/actions/App/Http/Controllers/Settings/ProjectContentSettingsController';
import Heading from '@/components/heading';
import { SettingsFormActions } from '@/components/settings-form-actions';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
                    noValidate
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

                                <FieldGroup className="grid gap-4 sm:grid-cols-2">
                                    <Field
                                        data-invalid={
                                            errors.revision_retention_count
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="revision_retention_count">
                                            {t(
                                                'settings.project.revisionRetentionCount',
                                            )}
                                        </FieldLabel>
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
                                            aria-invalid={
                                                errors.revision_retention_count
                                                    ? true
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.revision_retention_count
                                                    ? 'revision-retention-count-error'
                                                    : undefined
                                            }
                                        />
                                        <FieldError id="revision-retention-count-error">
                                            {errors.revision_retention_count}
                                        </FieldError>
                                    </Field>
                                    <Field
                                        data-invalid={
                                            errors.revision_retention_days
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="revision_retention_days">
                                            {t(
                                                'settings.project.revisionRetentionDays',
                                            )}
                                        </FieldLabel>
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
                                            aria-invalid={
                                                errors.revision_retention_days
                                                    ? true
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.revision_retention_days
                                                    ? 'revision-retention-days-error'
                                                    : undefined
                                            }
                                        />
                                        <FieldError id="revision-retention-days-error">
                                            {errors.revision_retention_days}
                                        </FieldError>
                                    </Field>
                                </FieldGroup>
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

                                <FieldGroup>
                                    <Field
                                        data-invalid={
                                            errors.preview_url_default
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="preview_url_default">
                                            {t(
                                                'settings.project.previewUrlDefault',
                                            )}
                                        </FieldLabel>
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
                                            aria-invalid={
                                                errors.preview_url_default
                                                    ? true
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.preview_url_default
                                                    ? 'preview-url-default-error'
                                                    : undefined
                                            }
                                        />
                                        <FieldError id="preview-url-default-error">
                                            {errors.preview_url_default}
                                        </FieldError>
                                    </Field>
                                </FieldGroup>
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

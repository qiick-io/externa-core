import { Form, Head } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import ProjectSettingsController from '@/actions/App/Http/Controllers/Settings/ProjectSettingsController';
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
import { Textarea } from '@/components/ui/textarea';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { edit as editProject } from '@/routes/project';
import type { BreadcrumbItem, ProjectSettingsForm } from '@/types';

type GeneralProjectSettings = Pick<
    ProjectSettingsForm,
    | 'name'
    | 'description'
    | 'url'
    | 'report_issue_url'
    | 'report_bug_url'
    | 'report_error_url'
>;

type Props = {
    project: GeneralProjectSettings;
};

function buildFormState(project: GeneralProjectSettings) {
    return {
        name: project.name ?? '',
        description: project.description ?? '',
        url: project.url ?? '',
        report_issue_url: project.report_issue_url ?? '',
        report_bug_url: project.report_bug_url ?? '',
        report_error_url: project.report_error_url ?? '',
    };
}

/**
 * General project settings (identity + reporting links).
 */
export default function ProjectSettingsPage({ project }: Props) {
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
            title: t('settings.project.breadcrumb'),
            href: editProject(),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('settings.project.head')} />

            <h1 className="sr-only">{t('settings.project.head')}</h1>

            <SettingsLayout>
                <Form
                    {...ProjectSettingsController.update.form()}
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
                                    title={t('settings.project.generalTitle')}
                                    description={t(
                                        'settings.project.generalDescription',
                                    )}
                                />

                                <FieldGroup className="gap-6">
                                    <Field
                                        data-invalid={
                                            errors.name ? true : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="name">
                                            {t('settings.project.name')}
                                        </FieldLabel>
                                        <Input
                                            id="name"
                                            name="name"
                                            value={form.name}
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    name: event.target.value,
                                                }))
                                            }
                                            aria-invalid={
                                                errors.name ? true : undefined
                                            }
                                            aria-describedby={
                                                errors.name
                                                    ? 'project-name-error'
                                                    : undefined
                                            }
                                        />
                                        <FieldError id="project-name-error">
                                            {errors.name}
                                        </FieldError>
                                    </Field>

                                    <Field
                                        data-invalid={
                                            errors.description
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="description">
                                            {t('settings.project.description')}
                                        </FieldLabel>
                                        <Textarea
                                            id="description"
                                            name="description"
                                            value={form.description}
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    description:
                                                        event.target.value,
                                                }))
                                            }
                                            aria-invalid={
                                                errors.description
                                                    ? true
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.description
                                                    ? 'project-description-error'
                                                    : undefined
                                            }
                                        />
                                        <FieldError id="project-description-error">
                                            {errors.description}
                                        </FieldError>
                                    </Field>

                                    <Field
                                        data-invalid={
                                            errors.url ? true : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="url">
                                            {t('settings.project.url')}
                                        </FieldLabel>
                                        <Input
                                            id="url"
                                            name="url"
                                            type="url"
                                            value={form.url}
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    url: event.target.value,
                                                }))
                                            }
                                            placeholder="https://example.com"
                                            aria-invalid={
                                                errors.url ? true : undefined
                                            }
                                            aria-describedby={
                                                errors.url
                                                    ? 'project-url-error'
                                                    : undefined
                                            }
                                        />
                                        <FieldError id="project-url-error">
                                            {errors.url}
                                        </FieldError>
                                    </Field>
                                </FieldGroup>
                            </div>

                            <Separator />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t('settings.project.reportingTitle')}
                                    description={t(
                                        'settings.project.reportingDescription',
                                    )}
                                />

                                <FieldGroup className="gap-6">
                                    {(
                                        [
                                            [
                                                'report_issue_url',
                                                t(
                                                    'settings.project.reportIssueUrl',
                                                ),
                                                'project-report-issue-url-error',
                                            ],
                                            [
                                                'report_bug_url',
                                                t(
                                                    'settings.project.reportBugUrl',
                                                ),
                                                'project-report-bug-url-error',
                                            ],
                                            [
                                                'report_error_url',
                                                t(
                                                    'settings.project.reportErrorUrl',
                                                ),
                                                'project-report-error-url-error',
                                            ],
                                        ] as const
                                    ).map(([field, label, errorId]) => (
                                        <Field
                                            key={field}
                                            data-invalid={
                                                errors[field]
                                                    ? true
                                                    : undefined
                                            }
                                        >
                                            <FieldLabel htmlFor={field}>
                                                {label}
                                            </FieldLabel>
                                            <Input
                                                id={field}
                                                name={field}
                                                type="url"
                                                value={form[field]}
                                                onChange={(event) =>
                                                    setForm((current) => ({
                                                        ...current,
                                                        [field]:
                                                            event.target.value,
                                                    }))
                                                }
                                                aria-invalid={
                                                    errors[field]
                                                        ? true
                                                        : undefined
                                                }
                                                aria-describedby={
                                                    errors[field]
                                                        ? errorId
                                                        : undefined
                                                }
                                            />
                                            <FieldError id={errorId}>
                                                {errors[field]}
                                            </FieldError>
                                        </Field>
                                    ))}
                                </FieldGroup>
                            </div>

                            <SettingsFormActions
                                processing={processing}
                                recentlySuccessful={recentlySuccessful}
                                isDirty={isDirty}
                                data-test="project-settings-save"
                            />
                        </>
                    )}
                </Form>
            </SettingsLayout>
        </AppLayout>
    );
}

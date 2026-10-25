import { Form, Head } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import ProjectSettingsController from '@/actions/App/Http/Controllers/Settings/ProjectSettingsController';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { SettingsFormActions } from '@/components/settings-form-actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

                                <div className="grid gap-2">
                                    <Label htmlFor="name">
                                        {t('settings.project.name')}
                                    </Label>
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
                                    />
                                    <InputError message={errors.name} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="description">
                                        {t('settings.project.description')}
                                    </Label>
                                    <Textarea
                                        id="description"
                                        name="description"
                                        value={form.description}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                description: event.target.value,
                                            }))
                                        }
                                    />
                                    <InputError message={errors.description} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="url">
                                        {t('settings.project.url')}
                                    </Label>
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
                                    />
                                    <InputError message={errors.url} />
                                </div>
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

                                {(
                                    [
                                        [
                                            'report_issue_url',
                                            t(
                                                'settings.project.reportIssueUrl',
                                            ),
                                        ],
                                        [
                                            'report_bug_url',
                                            t('settings.project.reportBugUrl'),
                                        ],
                                        [
                                            'report_error_url',
                                            t(
                                                'settings.project.reportErrorUrl',
                                            ),
                                        ],
                                    ] as const
                                ).map(([field, label]) => (
                                    <div key={field} className="grid gap-2">
                                        <Label htmlFor={field}>{label}</Label>
                                        <Input
                                            id={field}
                                            name={field}
                                            type="url"
                                            value={form[field]}
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    [field]: event.target.value,
                                                }))
                                            }
                                        />
                                        <InputError message={errors[field]} />
                                    </div>
                                ))}
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

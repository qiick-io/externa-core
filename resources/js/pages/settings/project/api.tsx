import { Form, Head } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import ProjectApiSettingsController from '@/actions/App/Http/Controllers/Settings/ProjectApiSettingsController';
import Heading from '@/components/heading';
import { SettingsFormActions } from '@/components/settings-form-actions';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { edit as editApi } from '@/routes/project/api';
import type { BreadcrumbItem, ProjectSettingsForm } from '@/types';

type ApiProjectSettings = Pick<
    ProjectSettingsForm,
    'public_api_allowed_origins'
>;

type Props = {
    project: ApiProjectSettings;
};

function buildFormState(project: ApiProjectSettings) {
    return {
        public_api_allowed_origins: (
            project.public_api_allowed_origins ?? []
        ).join('\n'),
    };
}

/**
 * Public API project settings (CORS allowed origins).
 */
export default function ProjectApiSettingsPage({ project }: Props) {
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
            title: t('settings.project.apiNav.breadcrumb'),
            href: editApi(),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('settings.project.apiNav.head')} />

            <h1 className="sr-only">{t('settings.project.apiNav.head')}</h1>

            <SettingsLayout>
                <Form
                    {...ProjectApiSettingsController.update.form()}
                    options={{ preserveScroll: true }}
                    className="space-y-10"
                    onSuccess={() => setIsDirty(false)}
                    noValidate
                >
                    {({ processing, recentlySuccessful, errors }) => {
                        const originsError =
                            errors.public_api_allowed_origins ??
                            errors['public_api_allowed_origins.0'];

                        return (
                            <>
                                <div className="space-y-6">
                                    <Heading
                                        variant="small"
                                        title={t(
                                            'settings.project.publicApiTitle',
                                        )}
                                        description={t(
                                            'settings.project.publicApiDescription',
                                        )}
                                    />

                                    <FieldGroup className="gap-6">
                                        <Field
                                            data-invalid={
                                                originsError
                                                    ? true
                                                    : undefined
                                            }
                                        >
                                            <FieldLabel htmlFor="public_api_allowed_origins">
                                                {t(
                                                    'settings.project.publicApiAllowedOrigins',
                                                )}
                                            </FieldLabel>
                                            <Textarea
                                                id="public_api_allowed_origins"
                                                name="public_api_allowed_origins"
                                                value={
                                                    form.public_api_allowed_origins
                                                }
                                                onChange={(event) =>
                                                    setForm((current) => ({
                                                        ...current,
                                                        public_api_allowed_origins:
                                                            event.target.value,
                                                    }))
                                                }
                                                placeholder={
                                                    'https://www.example.com\nhttps://app.example.com'
                                                }
                                                rows={4}
                                                aria-invalid={
                                                    originsError
                                                        ? true
                                                        : undefined
                                                }
                                                aria-describedby={
                                                    originsError
                                                        ? 'public-api-allowed-origins-error'
                                                        : 'public-api-allowed-origins-hint'
                                                }
                                            />
                                            <FieldDescription id="public-api-allowed-origins-hint">
                                                {t(
                                                    'settings.project.publicApiAllowedOriginsHint',
                                                )}
                                            </FieldDescription>
                                            <FieldError id="public-api-allowed-origins-error">
                                                {originsError}
                                            </FieldError>
                                        </Field>
                                    </FieldGroup>
                                </div>

                                <SettingsFormActions
                                    processing={processing}
                                    recentlySuccessful={recentlySuccessful}
                                    isDirty={isDirty}
                                    data-test="project-api-settings-save"
                                />
                            </>
                        );
                    }}
                </Form>
            </SettingsLayout>
        </AppLayout>
    );
}

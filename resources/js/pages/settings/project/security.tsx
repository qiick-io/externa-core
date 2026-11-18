import { Form, Head } from '@inertiajs/react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ProjectSecuritySettingsController from '@/actions/App/Http/Controllers/Settings/ProjectSecuritySettingsController';
import { buildFormState } from '@/components/settings/project-security/security-form-state';
import type { SecurityProjectSettings } from '@/components/settings/project-security/security-form-state';
import { SecurityLoginSection } from '@/components/settings/project-security/security-login-section';
import { SecurityOidcSection } from '@/components/settings/project-security/security-oidc-section';
import { SecurityRegistrationSection } from '@/components/settings/project-security/security-registration-section';
import { SettingsFormActions } from '@/components/settings-form-actions';
import { Separator } from '@/components/ui/separator';
import { useSettingsFormState } from '@/hooks/use-settings-form-state';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { edit as editSecurity } from '@/routes/project/security';
import type { BreadcrumbItem, ProjectRoleOption } from '@/types';

type Props = {
    project: SecurityProjectSettings;
    roles: ProjectRoleOption[];
    passwordPolicies: Array<'weak' | 'medium' | 'strong'>;
};

/**
 * Authentication & security project settings.
 */
export default function ProjectSecuritySettingsPage({
    project,
    roles,
    passwordPolicies,
}: Props) {
    const { t } = useTranslation();
    const initialForm = useMemo(() => buildFormState(project), [project]);
    const { form, setForm, isDirty, markSaved } =
        useSettingsFormState(initialForm);

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('settings.project.securityNav.breadcrumb'),
            href: editSecurity(),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('settings.project.securityNav.head')} />

            <h1 className="sr-only">
                {t('settings.project.securityNav.head')}
            </h1>

            <SettingsLayout>
                <Form
                    {...ProjectSecuritySettingsController.update.form()}
                    options={{ preserveScroll: true }}
                    className="space-y-12"
                    onSuccess={markSaved}
                    noValidate
                >
                    {({ processing, recentlySuccessful, errors }) => (
                        <>
                            <input
                                type="hidden"
                                name="registration_enabled"
                                value={form.registration_enabled ? '1' : '0'}
                            />
                            <input
                                type="hidden"
                                name="email_verification_required"
                                value={
                                    form.email_verification_required ? '1' : '0'
                                }
                            />
                            <input
                                type="hidden"
                                name="two_factor_required"
                                value={form.two_factor_required ? '1' : '0'}
                            />
                            <input
                                type="hidden"
                                name="password_policy"
                                value={form.password_policy}
                            />
                            <input
                                type="hidden"
                                name="default_user_role"
                                value={form.default_user_role}
                            />
                            <input
                                type="hidden"
                                name="oidc_enabled"
                                value={form.oidc_enabled ? '1' : '0'}
                            />
                            <input
                                type="hidden"
                                name="oidc_jit_provisioning"
                                value={form.oidc_jit_provisioning ? '1' : '0'}
                            />

                            <SecurityLoginSection
                                form={form}
                                setForm={setForm}
                                errors={errors}
                                passwordPolicies={passwordPolicies}
                            />

                            <Separator />

                            <SecurityOidcSection
                                form={form}
                                setForm={setForm}
                                errors={errors}
                                project={project}
                            />

                            <Separator />

                            <SecurityRegistrationSection
                                form={form}
                                setForm={setForm}
                                errors={errors}
                                roles={roles}
                            />

                            <SettingsFormActions
                                processing={processing}
                                recentlySuccessful={recentlySuccessful}
                                isDirty={isDirty}
                                data-test="project-security-settings-save"
                            />
                        </>
                    )}
                </Form>
            </SettingsLayout>
        </AppLayout>
    );
}

import { Form, Head } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import ProjectSecuritySettingsController from '@/actions/App/Http/Controllers/Settings/ProjectSecuritySettingsController';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { SettingsFormActions } from '@/components/settings-form-actions';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { edit as editSecurity } from '@/routes/project/security';
import type {
    BreadcrumbItem,
    ProjectRoleOption,
    ProjectSettingsForm,
} from '@/types';

type SecurityProjectSettings = Pick<
    ProjectSettingsForm,
    | 'password_policy'
    | 'login_max_attempts'
    | 'registration_enabled'
    | 'default_user_role'
    | 'email_verification_required'
    | 'two_factor_required'
    | 'allowed_domains'
    | 'oidc_enabled'
    | 'oidc_issuer'
    | 'oidc_client_id'
    | 'oidc_client_secret_configured'
    | 'oidc_button_label'
    | 'oidc_jit_provisioning'
>;

type Props = {
    project: SecurityProjectSettings;
    roles: ProjectRoleOption[];
    passwordPolicies: Array<'weak' | 'medium' | 'strong'>;
};

function buildFormState(project: SecurityProjectSettings) {
    return {
        password_policy: project.password_policy,
        login_max_attempts: project.login_max_attempts,
        registration_enabled: project.registration_enabled,
        default_user_role: project.default_user_role ?? '',
        email_verification_required: project.email_verification_required,
        two_factor_required: project.two_factor_required,
        allowed_domains: (project.allowed_domains ?? []).join(', '),
        oidc_enabled: project.oidc_enabled ?? false,
        oidc_issuer: project.oidc_issuer ?? '',
        oidc_client_id: project.oidc_client_id ?? '',
        oidc_client_secret: '',
        oidc_button_label: project.oidc_button_label ?? '',
        oidc_jit_provisioning: project.oidc_jit_provisioning ?? false,
    };
}

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
                    className="space-y-10"
                    onSuccess={() => setIsDirty(false)}
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

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t('settings.project.securityTitle')}
                                    description={t(
                                        'settings.project.securityDescription',
                                    )}
                                />

                                <div className="grid gap-2">
                                    <Label htmlFor="password_policy">
                                        {t('settings.project.passwordPolicy')}
                                    </Label>
                                    <Select
                                        value={form.password_policy}
                                        onValueChange={(value) => {
                                            if (
                                                value === 'weak' ||
                                                value === 'medium' ||
                                                value === 'strong'
                                            ) {
                                                setForm((current) => ({
                                                    ...current,
                                                    password_policy: value,
                                                }));
                                            }
                                        }}
                                    >
                                        <SelectTrigger
                                            id="password_policy"
                                            className="w-full"
                                        >
                                            <SelectValue>
                                                {t(
                                                    `settings.project.passwordPolicies.${form.password_policy}.label`,
                                                )}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {passwordPolicies.map((policy) => (
                                                <SelectItem
                                                    key={policy}
                                                    value={policy}
                                                    textValue={t(
                                                        `settings.project.passwordPolicies.${policy}.label`,
                                                    )}
                                                    className="items-start py-2"
                                                >
                                                    <span className="flex flex-col gap-0.5 text-left">
                                                        <span>
                                                            {t(
                                                                `settings.project.passwordPolicies.${policy}.label`,
                                                            )}
                                                        </span>
                                                        <span className="text-xs font-normal whitespace-normal text-muted-foreground">
                                                            {t(
                                                                `settings.project.passwordPolicies.${policy}.description`,
                                                            )}
                                                        </span>
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                                        {passwordPolicies.map((policy) => (
                                            <li key={`hint-${policy}`}>
                                                <span className="font-medium text-foreground">
                                                    {t(
                                                        `settings.project.passwordPolicies.${policy}.label`,
                                                    )}
                                                    :
                                                </span>{' '}
                                                {t(
                                                    `settings.project.passwordPolicies.${policy}.description`,
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                    <InputError
                                        message={errors.password_policy}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="login_max_attempts">
                                        {t('settings.project.loginMaxAttempts')}
                                    </Label>
                                    <Input
                                        id="login_max_attempts"
                                        name="login_max_attempts"
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={form.login_max_attempts}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                login_max_attempts: Number(
                                                    event.target.value,
                                                ),
                                            }))
                                        }
                                    />
                                    <InputError
                                        message={errors.login_max_attempts}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                        <Checkbox
                                            id="two_factor_required"
                                            checked={form.two_factor_required}
                                            onCheckedChange={(checked) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    two_factor_required:
                                                        checked === true,
                                                }))
                                            }
                                        />
                                        <Label htmlFor="two_factor_required">
                                            {t(
                                                'settings.project.twoFactorRequired',
                                            )}
                                        </Label>
                                    </div>
                                    <p className="pl-7 text-sm text-muted-foreground">
                                        {t(
                                            'settings.project.twoFactorRequiredHint',
                                        )}
                                    </p>
                                    <InputError
                                        message={errors.two_factor_required}
                                    />
                                </div>
                            </div>

                            <Separator />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t('settings.project.oidcTitle')}
                                    description={t(
                                        'settings.project.oidcDescription',
                                    )}
                                />

                                <div className="flex items-center gap-3">
                                    <Checkbox
                                        id="oidc_enabled"
                                        checked={form.oidc_enabled}
                                        onCheckedChange={(checked) =>
                                            setForm((current) => ({
                                                ...current,
                                                oidc_enabled: checked === true,
                                            }))
                                        }
                                    />
                                    <Label htmlFor="oidc_enabled">
                                        {t('settings.project.oidcEnabled')}
                                    </Label>
                                </div>
                                <InputError message={errors.oidc_enabled} />

                                <div className="grid gap-2">
                                    <Label htmlFor="oidc_issuer">
                                        {t('settings.project.oidcIssuer')}
                                    </Label>
                                    <Input
                                        id="oidc_issuer"
                                        name="oidc_issuer"
                                        type="url"
                                        placeholder="https://idp.example.com/realms/externa"
                                        value={form.oidc_issuer}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                oidc_issuer: event.target.value,
                                            }))
                                        }
                                    />
                                    <p className="text-sm text-muted-foreground">
                                        {t('settings.project.oidcIssuerHint')}
                                    </p>
                                    <InputError message={errors.oidc_issuer} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="oidc_client_id">
                                        {t('settings.project.oidcClientId')}
                                    </Label>
                                    <Input
                                        id="oidc_client_id"
                                        name="oidc_client_id"
                                        value={form.oidc_client_id}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                oidc_client_id:
                                                    event.target.value,
                                            }))
                                        }
                                    />
                                    <InputError
                                        message={errors.oidc_client_id}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="oidc_client_secret">
                                        {t('settings.project.oidcClientSecret')}
                                    </Label>
                                    <Input
                                        id="oidc_client_secret"
                                        name="oidc_client_secret"
                                        type="password"
                                        autoComplete="new-password"
                                        value={form.oidc_client_secret}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                oidc_client_secret:
                                                    event.target.value,
                                            }))
                                        }
                                        placeholder={
                                            project.oidc_client_secret_configured
                                                ? '••••••••'
                                                : undefined
                                        }
                                    />
                                    <p className="text-sm text-muted-foreground">
                                        {project.oidc_client_secret_configured
                                            ? t(
                                                  'settings.project.oidcSecretConfiguredHint',
                                              )
                                            : t(
                                                  'settings.project.oidcSecretEmptyHint',
                                              )}
                                    </p>
                                    <InputError
                                        message={errors.oidc_client_secret}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="oidc_button_label">
                                        {t('settings.project.oidcButtonLabel')}
                                    </Label>
                                    <Input
                                        id="oidc_button_label"
                                        name="oidc_button_label"
                                        value={form.oidc_button_label}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                oidc_button_label:
                                                    event.target.value,
                                            }))
                                        }
                                        placeholder={t(
                                            'settings.project.oidcButtonLabelPlaceholder',
                                        )}
                                    />
                                    <InputError
                                        message={errors.oidc_button_label}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                        <Checkbox
                                            id="oidc_jit_provisioning"
                                            checked={form.oidc_jit_provisioning}
                                            onCheckedChange={(checked) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    oidc_jit_provisioning:
                                                        checked === true,
                                                }))
                                            }
                                        />
                                        <Label htmlFor="oidc_jit_provisioning">
                                            {t(
                                                'settings.project.oidcJitProvisioning',
                                            )}
                                        </Label>
                                    </div>
                                    <p className="pl-7 text-sm text-muted-foreground">
                                        {t(
                                            'settings.project.oidcJitProvisioningHint',
                                        )}
                                    </p>
                                    <InputError
                                        message={errors.oidc_jit_provisioning}
                                    />
                                </div>

                                <p className="text-sm text-muted-foreground">
                                    {t('settings.project.oidcRedirectHint', {
                                        url:
                                            typeof window !== 'undefined'
                                                ? `${window.location.origin}/auth/oidc/callback`
                                                : '/auth/oidc/callback',
                                    })}
                                </p>
                            </div>

                            <Separator />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t(
                                        'settings.project.registrationTitle',
                                    )}
                                    description={t(
                                        'settings.project.registrationDescription',
                                    )}
                                />

                                <div className="flex items-center gap-3">
                                    <Checkbox
                                        id="registration_enabled"
                                        checked={form.registration_enabled}
                                        onCheckedChange={(checked) =>
                                            setForm((current) => ({
                                                ...current,
                                                registration_enabled:
                                                    checked === true,
                                            }))
                                        }
                                    />
                                    <Label htmlFor="registration_enabled">
                                        {t(
                                            'settings.project.registrationEnabled',
                                        )}
                                    </Label>
                                </div>
                                <InputError
                                    message={errors.registration_enabled}
                                />

                                <div className="grid gap-2">
                                    <Label htmlFor="default_user_role">
                                        {t('settings.project.defaultUserRole')}
                                    </Label>
                                    <Select
                                        value={
                                            form.default_user_role === ''
                                                ? '__none__'
                                                : form.default_user_role
                                        }
                                        onValueChange={(value) =>
                                            setForm((current) => ({
                                                ...current,
                                                default_user_role:
                                                    value === '__none__'
                                                        ? ''
                                                        : value,
                                            }))
                                        }
                                    >
                                        <SelectTrigger
                                            id="default_user_role"
                                            className="w-full"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__">
                                                {t('settings.project.noRole')}
                                            </SelectItem>
                                            {roles.map((role) => (
                                                <SelectItem
                                                    key={role.id}
                                                    value={role.name}
                                                >
                                                    {role.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <InputError
                                        message={errors.default_user_role}
                                    />
                                </div>

                                <div className="flex items-center gap-3">
                                    <Checkbox
                                        id="email_verification_required"
                                        checked={
                                            form.email_verification_required
                                        }
                                        onCheckedChange={(checked) =>
                                            setForm((current) => ({
                                                ...current,
                                                email_verification_required:
                                                    checked === true,
                                            }))
                                        }
                                    />
                                    <Label htmlFor="email_verification_required">
                                        {t(
                                            'settings.project.emailVerificationRequired',
                                        )}
                                    </Label>
                                </div>
                                <InputError
                                    message={errors.email_verification_required}
                                />

                                <div className="grid gap-2">
                                    <Label htmlFor="allowed_domains">
                                        {t('settings.project.allowedDomains')}
                                    </Label>
                                    <Textarea
                                        id="allowed_domains"
                                        name="allowed_domains"
                                        value={form.allowed_domains}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                allowed_domains:
                                                    event.target.value,
                                            }))
                                        }
                                        placeholder="example.com, company.org"
                                    />
                                    <p className="text-sm text-muted-foreground">
                                        {t(
                                            'settings.project.allowedDomainsHint',
                                        )}
                                    </p>
                                    <InputError
                                        message={errors.allowed_domains}
                                    />
                                </div>
                            </div>

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

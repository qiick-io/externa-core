import { Form, Head } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import ProjectSecuritySettingsController from '@/actions/App/Http/Controllers/Settings/ProjectSecuritySettingsController';
import Heading from '@/components/heading';
import { SettingsFormActions } from '@/components/settings-form-actions';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t('settings.project.securityTitle')}
                                    description={t(
                                        'settings.project.securityDescription',
                                    )}
                                />

                                <FieldGroup className="gap-6">
                                    <Field
                                        data-invalid={
                                            errors.password_policy
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="password_policy">
                                            {t(
                                                'settings.project.passwordPolicy',
                                            )}
                                        </FieldLabel>
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
                                                aria-invalid={
                                                    errors.password_policy
                                                        ? true
                                                        : undefined
                                                }
                                                aria-describedby={
                                                    errors.password_policy
                                                        ? 'password-policy-error'
                                                        : undefined
                                                }
                                            >
                                                <SelectValue>
                                                    {t(
                                                        `settings.project.passwordPolicies.${form.password_policy}.label`,
                                                    )}
                                                </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                                {passwordPolicies.map(
                                                    (policy) => (
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
                                                    ),
                                                )}
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
                                        <FieldError id="password-policy-error">
                                            {errors.password_policy}
                                        </FieldError>
                                    </Field>

                                    <Field
                                        data-invalid={
                                            errors.login_max_attempts
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="login_max_attempts">
                                            {t(
                                                'settings.project.loginMaxAttempts',
                                            )}
                                        </FieldLabel>
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
                                            aria-invalid={
                                                errors.login_max_attempts
                                                    ? true
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.login_max_attempts
                                                    ? 'login-max-attempts-error'
                                                    : undefined
                                            }
                                        />
                                        <FieldError id="login-max-attempts-error">
                                            {errors.login_max_attempts}
                                        </FieldError>
                                    </Field>

                                    <Field
                                        data-invalid={
                                            errors.two_factor_required
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <div className="flex items-center gap-3">
                                            <Checkbox
                                                id="two_factor_required"
                                                checked={
                                                    form.two_factor_required
                                                }
                                                onCheckedChange={(checked) =>
                                                    setForm((current) => ({
                                                        ...current,
                                                        two_factor_required:
                                                            checked === true,
                                                    }))
                                                }
                                                aria-invalid={
                                                    errors.two_factor_required
                                                        ? true
                                                        : undefined
                                                }
                                                aria-describedby={
                                                    errors.two_factor_required
                                                        ? 'two-factor-required-error'
                                                        : 'two-factor-required-hint'
                                                }
                                            />
                                            <FieldLabel htmlFor="two_factor_required">
                                                {t(
                                                    'settings.project.twoFactorRequired',
                                                )}
                                            </FieldLabel>
                                        </div>
                                        <FieldDescription
                                            id="two-factor-required-hint"
                                            className="pl-7"
                                        >
                                            {t(
                                                'settings.project.twoFactorRequiredHint',
                                            )}
                                        </FieldDescription>
                                        <FieldError id="two-factor-required-error">
                                            {errors.two_factor_required}
                                        </FieldError>
                                    </Field>
                                </FieldGroup>
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

                                <FieldGroup className="gap-6">
                                    <Field
                                        data-invalid={
                                            errors.oidc_enabled
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <div className="flex items-center gap-3">
                                            <Checkbox
                                                id="oidc_enabled"
                                                checked={form.oidc_enabled}
                                                onCheckedChange={(checked) =>
                                                    setForm((current) => ({
                                                        ...current,
                                                        oidc_enabled:
                                                            checked === true,
                                                    }))
                                                }
                                                aria-invalid={
                                                    errors.oidc_enabled
                                                        ? true
                                                        : undefined
                                                }
                                                aria-describedby={
                                                    errors.oidc_enabled
                                                        ? 'oidc-enabled-error'
                                                        : undefined
                                                }
                                            />
                                            <FieldLabel htmlFor="oidc_enabled">
                                                {t(
                                                    'settings.project.oidcEnabled',
                                                )}
                                            </FieldLabel>
                                        </div>
                                        <FieldError id="oidc-enabled-error">
                                            {errors.oidc_enabled}
                                        </FieldError>
                                    </Field>

                                    <Field
                                        data-invalid={
                                            errors.oidc_issuer
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="oidc_issuer">
                                            {t('settings.project.oidcIssuer')}
                                        </FieldLabel>
                                        <Input
                                            id="oidc_issuer"
                                            name="oidc_issuer"
                                            type="url"
                                            placeholder="https://idp.example.com/realms/externa"
                                            value={form.oidc_issuer}
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    oidc_issuer:
                                                        event.target.value,
                                                }))
                                            }
                                            aria-invalid={
                                                errors.oidc_issuer
                                                    ? true
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.oidc_issuer
                                                    ? 'oidc-issuer-error'
                                                    : 'oidc-issuer-hint'
                                            }
                                        />
                                        <FieldDescription id="oidc-issuer-hint">
                                            {t(
                                                'settings.project.oidcIssuerHint',
                                            )}
                                        </FieldDescription>
                                        <FieldError id="oidc-issuer-error">
                                            {errors.oidc_issuer}
                                        </FieldError>
                                    </Field>

                                    <Field
                                        data-invalid={
                                            errors.oidc_client_id
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="oidc_client_id">
                                            {t('settings.project.oidcClientId')}
                                        </FieldLabel>
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
                                            aria-invalid={
                                                errors.oidc_client_id
                                                    ? true
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.oidc_client_id
                                                    ? 'oidc-client-id-error'
                                                    : undefined
                                            }
                                        />
                                        <FieldError id="oidc-client-id-error">
                                            {errors.oidc_client_id}
                                        </FieldError>
                                    </Field>

                                    <Field
                                        data-invalid={
                                            errors.oidc_client_secret
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="oidc_client_secret">
                                            {t(
                                                'settings.project.oidcClientSecret',
                                            )}
                                        </FieldLabel>
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
                                            aria-invalid={
                                                errors.oidc_client_secret
                                                    ? true
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.oidc_client_secret
                                                    ? 'oidc-client-secret-error'
                                                    : 'oidc-client-secret-hint'
                                            }
                                        />
                                        <FieldDescription id="oidc-client-secret-hint">
                                            {project.oidc_client_secret_configured
                                                ? t(
                                                      'settings.project.oidcSecretConfiguredHint',
                                                  )
                                                : t(
                                                      'settings.project.oidcSecretEmptyHint',
                                                  )}
                                        </FieldDescription>
                                        <FieldError id="oidc-client-secret-error">
                                            {errors.oidc_client_secret}
                                        </FieldError>
                                    </Field>

                                    <Field
                                        data-invalid={
                                            errors.oidc_button_label
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="oidc_button_label">
                                            {t(
                                                'settings.project.oidcButtonLabel',
                                            )}
                                        </FieldLabel>
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
                                            aria-invalid={
                                                errors.oidc_button_label
                                                    ? true
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.oidc_button_label
                                                    ? 'oidc-button-label-error'
                                                    : undefined
                                            }
                                        />
                                        <FieldError id="oidc-button-label-error">
                                            {errors.oidc_button_label}
                                        </FieldError>
                                    </Field>

                                    <Field
                                        data-invalid={
                                            errors.oidc_jit_provisioning
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <div className="flex items-center gap-3">
                                            <Checkbox
                                                id="oidc_jit_provisioning"
                                                checked={
                                                    form.oidc_jit_provisioning
                                                }
                                                onCheckedChange={(checked) =>
                                                    setForm((current) => ({
                                                        ...current,
                                                        oidc_jit_provisioning:
                                                            checked === true,
                                                    }))
                                                }
                                                aria-invalid={
                                                    errors.oidc_jit_provisioning
                                                        ? true
                                                        : undefined
                                                }
                                                aria-describedby={
                                                    errors.oidc_jit_provisioning
                                                        ? 'oidc-jit-provisioning-error'
                                                        : 'oidc-jit-provisioning-hint'
                                                }
                                            />
                                            <FieldLabel htmlFor="oidc_jit_provisioning">
                                                {t(
                                                    'settings.project.oidcJitProvisioning',
                                                )}
                                            </FieldLabel>
                                        </div>
                                        <FieldDescription
                                            id="oidc-jit-provisioning-hint"
                                            className="pl-7"
                                        >
                                            {t(
                                                'settings.project.oidcJitProvisioningHint',
                                            )}
                                        </FieldDescription>
                                        <FieldError id="oidc-jit-provisioning-error">
                                            {errors.oidc_jit_provisioning}
                                        </FieldError>
                                    </Field>
                                </FieldGroup>

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

                                <FieldGroup className="gap-6">
                                    <Field
                                        data-invalid={
                                            errors.registration_enabled
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <div className="flex items-center gap-3">
                                            <Checkbox
                                                id="registration_enabled"
                                                checked={
                                                    form.registration_enabled
                                                }
                                                onCheckedChange={(checked) =>
                                                    setForm((current) => ({
                                                        ...current,
                                                        registration_enabled:
                                                            checked === true,
                                                    }))
                                                }
                                                aria-invalid={
                                                    errors.registration_enabled
                                                        ? true
                                                        : undefined
                                                }
                                                aria-describedby={
                                                    errors.registration_enabled
                                                        ? 'registration-enabled-error'
                                                        : undefined
                                                }
                                            />
                                            <FieldLabel htmlFor="registration_enabled">
                                                {t(
                                                    'settings.project.registrationEnabled',
                                                )}
                                            </FieldLabel>
                                        </div>
                                        <FieldError id="registration-enabled-error">
                                            {errors.registration_enabled}
                                        </FieldError>
                                    </Field>

                                    <Field
                                        data-invalid={
                                            errors.default_user_role
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="default_user_role">
                                            {t(
                                                'settings.project.defaultUserRole',
                                            )}
                                        </FieldLabel>
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
                                                aria-invalid={
                                                    errors.default_user_role
                                                        ? true
                                                        : undefined
                                                }
                                                aria-describedby={
                                                    errors.default_user_role
                                                        ? 'default-user-role-error'
                                                        : undefined
                                                }
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">
                                                    {t(
                                                        'settings.project.noRole',
                                                    )}
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
                                        <FieldError id="default-user-role-error">
                                            {errors.default_user_role}
                                        </FieldError>
                                    </Field>

                                    <Field
                                        data-invalid={
                                            errors.email_verification_required
                                                ? true
                                                : undefined
                                        }
                                    >
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
                                                aria-invalid={
                                                    errors.email_verification_required
                                                        ? true
                                                        : undefined
                                                }
                                                aria-describedby={
                                                    errors.email_verification_required
                                                        ? 'email-verification-required-error'
                                                        : undefined
                                                }
                                            />
                                            <FieldLabel htmlFor="email_verification_required">
                                                {t(
                                                    'settings.project.emailVerificationRequired',
                                                )}
                                            </FieldLabel>
                                        </div>
                                        <FieldError id="email-verification-required-error">
                                            {errors.email_verification_required}
                                        </FieldError>
                                    </Field>

                                    <Field
                                        data-invalid={
                                            errors.allowed_domains
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="allowed_domains">
                                            {t(
                                                'settings.project.allowedDomains',
                                            )}
                                        </FieldLabel>
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
                                            aria-invalid={
                                                errors.allowed_domains
                                                    ? true
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.allowed_domains
                                                    ? 'allowed-domains-error'
                                                    : 'allowed-domains-hint'
                                            }
                                        />
                                        <FieldDescription id="allowed-domains-hint">
                                            {t(
                                                'settings.project.allowedDomainsHint',
                                            )}
                                        </FieldDescription>
                                        <FieldError id="allowed-domains-error">
                                            {errors.allowed_domains}
                                        </FieldError>
                                    </Field>
                                </FieldGroup>
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

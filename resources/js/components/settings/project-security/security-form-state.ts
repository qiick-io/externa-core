import type { ProjectSettingsForm } from '@/types';

export type SecurityProjectSettings = Pick<
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

/**
 * Builds the security form state from the server props. The OIDC client secret is never
 * sent back, so its input starts empty; allowed domains are edited as one comma list.
 */
export function buildFormState(project: SecurityProjectSettings) {
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

/** Local state of the security settings form. */
export type SecurityFormState = ReturnType<typeof buildFormState>;

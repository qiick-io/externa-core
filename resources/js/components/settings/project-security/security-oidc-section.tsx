import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import Heading from '@/components/heading';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type {
    SecurityFormState,
    SecurityProjectSettings,
} from '@/components/settings/project-security/security-form-state';

/**
 * OpenID Connect single sign-on: issuer, client credentials, button label, just-in-time
 * provisioning and the redirect URL to register at the identity provider.
 */
export function SecurityOidcSection({
    form,
    setForm,
    errors,
    project,
}: {
    form: SecurityFormState;
    setForm: Dispatch<SetStateAction<SecurityFormState>>;
    errors: Record<string, string | undefined>;
    project: SecurityProjectSettings;
}) {
    const { t } = useTranslation();

    return (
        <div className="space-y-6">
            <Heading
                variant="small"
                title={t('settings.project.oidcTitle')}
                description={t('settings.project.oidcDescription')}
            />

            <FieldGroup className="gap-6">
                <Field data-invalid={errors.oidc_enabled ? true : undefined}>
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
                            aria-invalid={
                                errors.oidc_enabled ? true : undefined
                            }
                            aria-describedby={
                                errors.oidc_enabled
                                    ? 'oidc-enabled-error'
                                    : undefined
                            }
                        />
                        <FieldLabel htmlFor="oidc_enabled">
                            {t('settings.project.oidcEnabled')}
                        </FieldLabel>
                    </div>
                    <FieldError id="oidc-enabled-error">
                        {errors.oidc_enabled}
                    </FieldError>
                </Field>

                <Field data-invalid={errors.oidc_issuer ? true : undefined}>
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
                                oidc_issuer: event.target.value,
                            }))
                        }
                        aria-invalid={errors.oidc_issuer ? true : undefined}
                        aria-describedby={
                            errors.oidc_issuer
                                ? 'oidc-issuer-error'
                                : 'oidc-issuer-hint'
                        }
                    />
                    <FieldDescription id="oidc-issuer-hint">
                        {t('settings.project.oidcIssuerHint')}
                    </FieldDescription>
                    <FieldError id="oidc-issuer-error">
                        {errors.oidc_issuer}
                    </FieldError>
                </Field>

                <Field data-invalid={errors.oidc_client_id ? true : undefined}>
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
                                oidc_client_id: event.target.value,
                            }))
                        }
                        aria-invalid={errors.oidc_client_id ? true : undefined}
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
                    data-invalid={errors.oidc_client_secret ? true : undefined}
                >
                    <FieldLabel htmlFor="oidc_client_secret">
                        {t('settings.project.oidcClientSecret')}
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
                                oidc_client_secret: event.target.value,
                            }))
                        }
                        placeholder={
                            project.oidc_client_secret_configured
                                ? '••••••••'
                                : undefined
                        }
                        aria-invalid={
                            errors.oidc_client_secret ? true : undefined
                        }
                        aria-describedby={
                            errors.oidc_client_secret
                                ? 'oidc-client-secret-error'
                                : 'oidc-client-secret-hint'
                        }
                    />
                    <FieldDescription id="oidc-client-secret-hint">
                        {project.oidc_client_secret_configured
                            ? t('settings.project.oidcSecretConfiguredHint')
                            : t('settings.project.oidcSecretEmptyHint')}
                    </FieldDescription>
                    <FieldError id="oidc-client-secret-error">
                        {errors.oidc_client_secret}
                    </FieldError>
                </Field>

                <Field
                    data-invalid={errors.oidc_button_label ? true : undefined}
                >
                    <FieldLabel htmlFor="oidc_button_label">
                        {t('settings.project.oidcButtonLabel')}
                    </FieldLabel>
                    <Input
                        id="oidc_button_label"
                        name="oidc_button_label"
                        value={form.oidc_button_label}
                        onChange={(event) =>
                            setForm((current) => ({
                                ...current,
                                oidc_button_label: event.target.value,
                            }))
                        }
                        placeholder={t(
                            'settings.project.oidcButtonLabelPlaceholder',
                        )}
                        aria-invalid={
                            errors.oidc_button_label ? true : undefined
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
                        errors.oidc_jit_provisioning ? true : undefined
                    }
                >
                    <div className="flex items-center gap-3">
                        <Checkbox
                            id="oidc_jit_provisioning"
                            checked={form.oidc_jit_provisioning}
                            onCheckedChange={(checked) =>
                                setForm((current) => ({
                                    ...current,
                                    oidc_jit_provisioning: checked === true,
                                }))
                            }
                            aria-invalid={
                                errors.oidc_jit_provisioning ? true : undefined
                            }
                            aria-describedby={
                                errors.oidc_jit_provisioning
                                    ? 'oidc-jit-provisioning-error'
                                    : 'oidc-jit-provisioning-hint'
                            }
                        />
                        <FieldLabel htmlFor="oidc_jit_provisioning">
                            {t('settings.project.oidcJitProvisioning')}
                        </FieldLabel>
                    </div>
                    <FieldDescription
                        id="oidc-jit-provisioning-hint"
                        className="pl-8"
                    >
                        {t('settings.project.oidcJitProvisioningHint')}
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
    );
}

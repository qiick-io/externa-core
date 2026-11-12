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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { SecurityFormState } from '@/components/settings/project-security/security-form-state';
import type { ProjectRoleOption } from '@/types';

/**
 * Self-registration: whether it is open, the role new users get, email verification and
 * the allowed email domains.
 */
export function SecurityRegistrationSection({
    form,
    setForm,
    errors,
    roles,
}: {
    form: SecurityFormState;
    setForm: Dispatch<SetStateAction<SecurityFormState>>;
    errors: Record<string, string | undefined>;
    roles: ProjectRoleOption[];
}) {
    const { t } = useTranslation();

    return (
        <div className="space-y-6">
            <Heading
                variant="small"
                title={t('settings.project.registrationTitle')}
                description={t('settings.project.registrationDescription')}
            />

            <FieldGroup className="gap-6">
                <Field
                    data-invalid={
                        errors.registration_enabled ? true : undefined
                    }
                >
                    <div className="flex items-center gap-3">
                        <Checkbox
                            id="registration_enabled"
                            checked={form.registration_enabled}
                            onCheckedChange={(checked) =>
                                setForm((current) => ({
                                    ...current,
                                    registration_enabled: checked === true,
                                }))
                            }
                            aria-invalid={
                                errors.registration_enabled ? true : undefined
                            }
                            aria-describedby={
                                errors.registration_enabled
                                    ? 'registration-enabled-error'
                                    : undefined
                            }
                        />
                        <FieldLabel htmlFor="registration_enabled">
                            {t('settings.project.registrationEnabled')}
                        </FieldLabel>
                    </div>
                    <FieldError id="registration-enabled-error">
                        {errors.registration_enabled}
                    </FieldError>
                </Field>

                <Field
                    data-invalid={errors.default_user_role ? true : undefined}
                >
                    <FieldLabel htmlFor="default_user_role">
                        {t('settings.project.defaultUserRole')}
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
                                    value === '__none__' ? '' : value,
                            }))
                        }
                    >
                        <SelectTrigger
                            id="default_user_role"
                            className="w-full"
                            aria-invalid={
                                errors.default_user_role ? true : undefined
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
                                {t('settings.project.noRole')}
                            </SelectItem>
                            {roles.map((role) => (
                                <SelectItem key={role.id} value={role.name}>
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
                        errors.email_verification_required ? true : undefined
                    }
                >
                    <div className="flex items-center gap-3">
                        <Checkbox
                            id="email_verification_required"
                            checked={form.email_verification_required}
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
                            {t('settings.project.emailVerificationRequired')}
                        </FieldLabel>
                    </div>
                    <FieldError id="email-verification-required-error">
                        {errors.email_verification_required}
                    </FieldError>
                </Field>

                <Field data-invalid={errors.allowed_domains ? true : undefined}>
                    <FieldLabel htmlFor="allowed_domains">
                        {t('settings.project.allowedDomains')}
                    </FieldLabel>
                    <Textarea
                        id="allowed_domains"
                        name="allowed_domains"
                        value={form.allowed_domains}
                        onChange={(event) =>
                            setForm((current) => ({
                                ...current,
                                allowed_domains: event.target.value,
                            }))
                        }
                        placeholder="example.com, company.org"
                        aria-invalid={errors.allowed_domains ? true : undefined}
                        aria-describedby={
                            errors.allowed_domains
                                ? 'allowed-domains-error'
                                : 'allowed-domains-hint'
                        }
                    />
                    <FieldDescription id="allowed-domains-hint">
                        {t('settings.project.allowedDomainsHint')}
                    </FieldDescription>
                    <FieldError id="allowed-domains-error">
                        {errors.allowed_domains}
                    </FieldError>
                </Field>
            </FieldGroup>
        </div>
    );
}

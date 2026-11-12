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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { SecurityFormState } from '@/components/settings/project-security/security-form-state';

/**
 * Sign-in security: the password policy (with a hint per policy), the login attempt limit
 * and the two-factor requirement.
 */
export function SecurityLoginSection({
    form,
    setForm,
    errors,
    passwordPolicies,
}: {
    form: SecurityFormState;
    setForm: Dispatch<SetStateAction<SecurityFormState>>;
    errors: Record<string, string | undefined>;
    passwordPolicies: Array<'weak' | 'medium' | 'strong'>;
}) {
    const { t } = useTranslation();

    return (
        <div className="space-y-6">
            <Heading
                variant="small"
                title={t('settings.project.securityTitle')}
                description={t('settings.project.securityDescription')}
            />

            <FieldGroup className="gap-6">
                <Field data-invalid={errors.password_policy ? true : undefined}>
                    <FieldLabel htmlFor="password_policy">
                        {t('settings.project.passwordPolicy')}
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
                                errors.password_policy ? true : undefined
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
                    <ul className="list-disc space-y-1 pl-6 text-sm text-muted-foreground">
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
                    data-invalid={errors.login_max_attempts ? true : undefined}
                >
                    <FieldLabel htmlFor="login_max_attempts">
                        {t('settings.project.loginMaxAttempts')}
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
                                login_max_attempts: Number(event.target.value),
                            }))
                        }
                        aria-invalid={
                            errors.login_max_attempts ? true : undefined
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
                    data-invalid={errors.two_factor_required ? true : undefined}
                >
                    <div className="flex items-center gap-3">
                        <Checkbox
                            id="two_factor_required"
                            checked={form.two_factor_required}
                            onCheckedChange={(checked) =>
                                setForm((current) => ({
                                    ...current,
                                    two_factor_required: checked === true,
                                }))
                            }
                            aria-invalid={
                                errors.two_factor_required ? true : undefined
                            }
                            aria-describedby={
                                errors.two_factor_required
                                    ? 'two-factor-required-error'
                                    : 'two-factor-required-hint'
                            }
                        />
                        <FieldLabel htmlFor="two_factor_required">
                            {t('settings.project.twoFactorRequired')}
                        </FieldLabel>
                    </div>
                    <FieldDescription
                        id="two-factor-required-hint"
                        className="pl-8"
                    >
                        {t('settings.project.twoFactorRequiredHint')}
                    </FieldDescription>
                    <FieldError id="two-factor-required-error">
                        {errors.two_factor_required}
                    </FieldError>
                </Field>
            </FieldGroup>
        </div>
    );
}

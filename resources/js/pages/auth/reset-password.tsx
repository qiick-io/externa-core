import { Form, Head } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import PasswordInput from '@/components/password-input';
import { Button } from '@/components/ui/button';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import AuthLayout from '@/layouts/auth-layout';
import { update } from '@/routes/password';

type Props = {
    token: string;
    email: string;
};

/**
 * Set a new password from a reset token.
 */
export default function ResetPassword({ token, email }: Props) {
    const { t } = useTranslation();

    return (
        <AuthLayout
            title={t('auth.resetPassword.title')}
            description={t('auth.resetPassword.description')}
        >
            <Head title={t('auth.resetPassword.head')} />

            <Form
                {...update.form()}
                transform={(data) => ({ ...data, token, email })}
                resetOnSuccess={['password', 'password_confirmation']}
                noValidate
            >
                {({ processing, errors }) => (
                    <FieldGroup className="gap-6">
                        <Field data-invalid={errors.email ? true : undefined}>
                            <FieldLabel htmlFor="email">
                                {t('common.email')}
                            </FieldLabel>
                            <Input
                                id="email"
                                type="email"
                                name="email"
                                autoComplete="email"
                                value={email}
                                className="mt-1 block w-full"
                                readOnly
                                aria-invalid={errors.email ? true : undefined}
                                aria-describedby={
                                    errors.email ? 'email-error' : undefined
                                }
                            />
                            <FieldError id="email-error">
                                {errors.email}
                            </FieldError>
                        </Field>

                        <Field
                            data-invalid={errors.password ? true : undefined}
                        >
                            <FieldLabel htmlFor="password">
                                {t('common.password')}
                            </FieldLabel>
                            <PasswordInput
                                id="password"
                                name="password"
                                autoComplete="new-password"
                                className="mt-1 block w-full"
                                // eslint-disable-next-line jsx-a11y/no-autofocus -- focus primary field when surface opens
                                autoFocus
                                placeholder={t('common.password')}
                                aria-invalid={
                                    errors.password ? true : undefined
                                }
                                aria-describedby={
                                    errors.password
                                        ? 'password-error'
                                        : undefined
                                }
                            />
                            <FieldError id="password-error">
                                {errors.password}
                            </FieldError>
                        </Field>

                        <Field
                            data-invalid={
                                errors.password_confirmation ? true : undefined
                            }
                        >
                            <FieldLabel htmlFor="password_confirmation">
                                {t('common.confirmPassword')}
                            </FieldLabel>
                            <PasswordInput
                                id="password_confirmation"
                                name="password_confirmation"
                                autoComplete="new-password"
                                className="mt-1 block w-full"
                                placeholder={t('common.confirmPassword')}
                                aria-invalid={
                                    errors.password_confirmation
                                        ? true
                                        : undefined
                                }
                                aria-describedby={
                                    errors.password_confirmation
                                        ? 'password-confirmation-error'
                                        : undefined
                                }
                            />
                            <FieldError id="password-confirmation-error">
                                {errors.password_confirmation}
                            </FieldError>
                        </Field>

                        <Button
                            type="submit"
                            className="mt-4 w-full"
                            disabled={processing}
                            data-test="reset-password-button"
                        >
                            {processing && <Spinner />}
                            {t('auth.resetPassword.submit')}
                        </Button>
                    </FieldGroup>
                )}
            </Form>
        </AuthLayout>
    );
}

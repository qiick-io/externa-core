import { Form, Head } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import PasswordInput from '@/components/password-input';
import TextLink from '@/components/text-link';
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
import { login } from '@/routes';
import { store } from '@/routes/register';

/**
 * User registration form.
 */
export default function Register() {
    const { t } = useTranslation();

    return (
        <AuthLayout
            title={t('auth.register.title')}
            description={t('auth.register.description')}
        >
            <Head title={t('auth.register.head')} />
            <Form
                {...store.form()}
                resetOnSuccess={['password', 'password_confirmation']}
                disableWhileProcessing
                className="flex flex-col gap-6"
                noValidate
            >
                {({ processing, errors }) => (
                    <>
                        <FieldGroup className="gap-6">
                            <Field
                                data-invalid={
                                    errors.first_name ? true : undefined
                                }
                            >
                                <FieldLabel htmlFor="first_name">
                                    {t('common.firstName')}
                                </FieldLabel>
                                <Input
                                    id="first_name"
                                    type="text"
                                    required
                                    autoFocus
                                    autoComplete="given-name"
                                    name="first_name"
                                    placeholder={t('common.firstName')}
                                    aria-invalid={
                                        errors.first_name ? true : undefined
                                    }
                                    aria-describedby={
                                        errors.first_name
                                            ? 'first-name-error'
                                            : undefined
                                    }
                                />
                                <FieldError id="first-name-error">
                                    {errors.first_name}
                                </FieldError>
                            </Field>

                            <Field
                                data-invalid={
                                    errors.last_name ? true : undefined
                                }
                            >
                                <FieldLabel htmlFor="last_name">
                                    {t('common.lastName')}
                                </FieldLabel>
                                <Input
                                    id="last_name"
                                    type="text"
                                    required
                                    autoComplete="family-name"
                                    name="last_name"
                                    placeholder={t('common.lastName')}
                                    aria-invalid={
                                        errors.last_name ? true : undefined
                                    }
                                    aria-describedby={
                                        errors.last_name
                                            ? 'last-name-error'
                                            : undefined
                                    }
                                />
                                <FieldError id="last-name-error">
                                    {errors.last_name}
                                </FieldError>
                            </Field>

                            <Field
                                data-invalid={errors.email ? true : undefined}
                            >
                                <FieldLabel htmlFor="email">
                                    {t('common.emailAddress')}
                                </FieldLabel>
                                <Input
                                    id="email"
                                    type="email"
                                    required
                                    autoComplete="email"
                                    name="email"
                                    placeholder="email@example.com"
                                    aria-invalid={
                                        errors.email ? true : undefined
                                    }
                                    aria-describedby={
                                        errors.email ? 'email-error' : undefined
                                    }
                                />
                                <FieldError id="email-error">
                                    {errors.email}
                                </FieldError>
                            </Field>

                            <Field
                                data-invalid={
                                    errors.password ? true : undefined
                                }
                            >
                                <FieldLabel htmlFor="password">
                                    {t('common.password')}
                                </FieldLabel>
                                <PasswordInput
                                    id="password"
                                    required
                                    autoComplete="new-password"
                                    name="password"
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
                                    errors.password_confirmation
                                        ? true
                                        : undefined
                                }
                            >
                                <FieldLabel htmlFor="password_confirmation">
                                    {t('common.confirmPassword')}
                                </FieldLabel>
                                <PasswordInput
                                    id="password_confirmation"
                                    required
                                    autoComplete="new-password"
                                    name="password_confirmation"
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
                                className="mt-2 w-full"
                                data-test="register-user-button"
                            >
                                {processing && <Spinner />}
                                {t('auth.register.submit')}
                            </Button>
                        </FieldGroup>

                        <div className="text-center text-sm text-muted-foreground">
                            {t('auth.register.hasAccount')}{' '}
                            <TextLink href={login()} tabIndex={7}>
                                {t('auth.register.logIn')}
                            </TextLink>
                        </div>
                    </>
                )}
            </Form>
        </AuthLayout>
    );
}

import { Form, Head } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import InputError from '@/components/input-error';
import PasswordInput from '@/components/password-input';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
            >
                {({ processing, errors }) => (
                    <>
                        <div className="grid gap-6">
                            <div className="grid gap-2">
                                <Label htmlFor="first_name">
                                    {t('common.firstName')}
                                </Label>
                                <Input
                                    id="first_name"
                                    type="text"
                                    required
                                    autoFocus
                                    tabIndex={1}
                                    autoComplete="given-name"
                                    name="first_name"
                                    placeholder={t('common.firstName')}
                                />
                                <InputError
                                    message={errors.first_name}
                                    className="mt-2"
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="last_name">
                                    {t('common.lastName')}
                                </Label>
                                <Input
                                    id="last_name"
                                    type="text"
                                    required
                                    tabIndex={2}
                                    autoComplete="family-name"
                                    name="last_name"
                                    placeholder={t('common.lastName')}
                                />
                                <InputError
                                    message={errors.last_name}
                                    className="mt-2"
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="email">
                                    {t('common.emailAddress')}
                                </Label>
                                <Input
                                    id="email"
                                    type="email"
                                    required
                                    tabIndex={3}
                                    autoComplete="email"
                                    name="email"
                                    placeholder="email@example.com"
                                />
                                <InputError message={errors.email} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="password">
                                    {t('common.password')}
                                </Label>
                                <PasswordInput
                                    id="password"
                                    required
                                    tabIndex={4}
                                    autoComplete="new-password"
                                    name="password"
                                    placeholder={t('common.password')}
                                />
                                <InputError message={errors.password} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="password_confirmation">
                                    {t('common.confirmPassword')}
                                </Label>
                                <PasswordInput
                                    id="password_confirmation"
                                    required
                                    tabIndex={5}
                                    autoComplete="new-password"
                                    name="password_confirmation"
                                    placeholder={t('common.confirmPassword')}
                                />
                                <InputError
                                    message={errors.password_confirmation}
                                />
                            </div>

                            <Button
                                type="submit"
                                className="mt-2 w-full"
                                tabIndex={6}
                                data-test="register-user-button"
                            >
                                {processing && <Spinner />}
                                {t('auth.register.submit')}
                            </Button>
                        </div>

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

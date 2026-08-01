import { Form, Head, router } from '@inertiajs/react';
import { UserCancelledError } from '@laravel/passkeys';
import { usePasskeyVerify } from '@laravel/passkeys/react';
import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import InputError from '@/components/input-error';
import PasswordInput from '@/components/password-input';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import AuthLayout from '@/layouts/auth-layout';
import { register } from '@/routes';
import { store } from '@/routes/login';
import { request } from '@/routes/password';

type Props = {
    status?: string;
    canResetPassword: boolean;
    canRegister: boolean;
    canManagePasskeys?: boolean;
};

/**
 * User login form with optional passkey sign-in.
 *
 * Conditional WebAuthn autofill (`autofill: true` + `autocomplete="… webauthn"`) is
 * intentionally off. @laravel/passkeys sets shared `isLoading` for the whole autofill
 * ceremony, which can hang indefinitely on some browsers (e.g. Brave) and leaves the
 * passkey button spinning on mount. Sign-in is click-only; the password form stays usable.
 */
export default function Login({
    status,
    canResetPassword,
    canRegister,
    canManagePasskeys = false,
}: Props) {
    const { t } = useTranslation();

    const {
        verify,
        isLoading: verifyingPasskey,
        error: passkeyError,
        errorInstance: passkeyErrorInstance,
        isSupported: passkeysSupported,
    } = usePasskeyVerify({
        // ponytail: no conditional autofill — package isLoading blocks the CTA until the
        // hung ceremony resolves; upgrade path: call Passkeys.autofill() separately without
        // wiring its pending state to the button.
        autofill: false,
        onSuccess: (response) => {
            if (response.redirect) {
                router.visit(response.redirect);
            } else {
                router.visit('/');
            }
        },
    });

    const passkeyErrorMessage =
        passkeyErrorInstance instanceof UserCancelledError
            ? t('auth.login.passkeyCancelled')
            : passkeyError;

    return (
        <AuthLayout
            title={t('auth.login.title')}
            description={t('auth.login.description')}
        >
            <Head title={t('auth.login.head')} />

            {canManagePasskeys && passkeysSupported && (
                <div className="mb-6 flex flex-col gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={verifyingPasskey}
                        data-test="passkey-login-button"
                        aria-busy={verifyingPasskey}
                        onClick={() => void verify()}
                    >
                        {verifyingPasskey ? <Spinner /> : <KeyRound />}
                        {t('auth.login.passkey')}
                    </Button>
                    <InputError message={passkeyErrorMessage} />
                    <div className="relative py-1">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">
                                {t('auth.login.orContinueWithEmail')}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            <Form
                {...store.form()}
                resetOnSuccess={['password']}
                className="flex flex-col gap-6"
            >
                {({ processing, errors }) => (
                    <>
                        <div className="grid gap-6">
                            <div className="grid gap-2">
                                <Label htmlFor="email">
                                    {t('common.emailAddress')}
                                </Label>
                                <Input
                                    id="email"
                                    type="email"
                                    name="email"
                                    required
                                    autoFocus
                                    tabIndex={1}
                                    autoComplete="email"
                                    placeholder="email@example.com"
                                />
                                <InputError message={errors.email} />
                            </div>

                            <div className="grid gap-2">
                                <div className="flex items-center">
                                    <Label htmlFor="password">
                                        {t('common.password')}
                                    </Label>
                                    {canResetPassword && (
                                        <TextLink
                                            href={request()}
                                            className="ml-auto text-sm"
                                            tabIndex={5}
                                        >
                                            {t('auth.login.forgotPassword')}
                                        </TextLink>
                                    )}
                                </div>
                                <PasswordInput
                                    id="password"
                                    name="password"
                                    required
                                    tabIndex={2}
                                    autoComplete="current-password"
                                    placeholder={t('common.password')}
                                />
                                <InputError message={errors.password} />
                            </div>

                            <div className="flex items-center space-x-3">
                                <Checkbox
                                    id="remember"
                                    name="remember"
                                    tabIndex={3}
                                />
                                <Label htmlFor="remember">
                                    {t('auth.login.rememberMe')}
                                </Label>
                            </div>

                            <Button
                                type="submit"
                                className="mt-4 w-full"
                                tabIndex={4}
                                disabled={processing}
                                data-test="login-button"
                            >
                                {processing && <Spinner />}
                                {t('auth.login.submit')}
                            </Button>
                        </div>

                        {canRegister && (
                            <div className="text-center text-sm text-muted-foreground">
                                {t('auth.login.noAccount')}{' '}
                                <TextLink href={register()} tabIndex={5}>
                                    {t('auth.login.signUp')}
                                </TextLink>
                            </div>
                        )}
                    </>
                )}
            </Form>

            {status && (
                <div className="mb-4 text-center text-sm font-medium text-green-600">
                    {status}
                </div>
            )}
        </AuthLayout>
    );
}

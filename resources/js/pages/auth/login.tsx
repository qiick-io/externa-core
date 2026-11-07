import { Form, Head, router, usePage } from '@inertiajs/react';
import { UserCancelledError } from '@laravel/passkeys';
import { usePasskeyVerify } from '@laravel/passkeys/react';
import { CircleCheck, KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PasswordInput from '@/components/password-input';
import TextLink from '@/components/text-link';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldSeparator,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import AuthLayout from '@/layouts/auth-layout';
import { register } from '@/routes';
import { store } from '@/routes/login';
import { request } from '@/routes/password';

type Props = {
    status?: string;
    canResetPassword: boolean;
    canRegister: boolean;
    canManagePasskeys?: boolean;
    canUseOidc?: boolean;
    oidcButtonLabel?: string | null;
};

/**
 * User login form with optional passkey + OIDC sign-in.
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
    canUseOidc = false,
    oidcButtonLabel = null,
}: Props) {
    const { t } = useTranslation();
    // OIDC callback rejects redirect here with session errors; Form render-prop
    // errors only cover password POST — surface page-level errors under SSO.
    const pageEmailError = usePage().props.errors?.email;

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

    const passkeyUnavailableHint = !passkeysSupported
        ? typeof window !== 'undefined' && !window.isSecureContext
            ? t('auth.login.passkeysNeedHttps')
            : t('auth.login.passkeysUnsupported')
        : undefined;

    const showAltSignIn = canManagePasskeys || canUseOidc;

    const passkeyButton = (
        <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!passkeysSupported || verifyingPasskey}
            data-test="passkey-login-button"
            aria-busy={verifyingPasskey}
            onClick={() => {
                if (passkeysSupported) {
                    void verify();
                }
            }}
        >
            {verifyingPasskey ? <Spinner /> : <KeyRound />}
            {t('auth.login.passkey')}
        </Button>
    );

    return (
        <AuthLayout
            title={t('auth.login.title')}
            description={t('auth.login.description')}
        >
            <Head title={t('auth.login.head')} />

            {showAltSignIn && (
                <div className="mb-6 flex flex-col gap-3">
                    {canUseOidc && (
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full"
                                data-test="oidc-login-button"
                                asChild
                            >
                                <a href="/auth/oidc/redirect">
                                    {oidcButtonLabel?.trim()
                                        ? oidcButtonLabel
                                        : t('auth.login.oidc')}
                                </a>
                            </Button>
                            <FieldError
                                id="oidc-login-error"
                                data-test="oidc-login-error"
                            >
                                {pageEmailError}
                            </FieldError>
                        </>
                    )}
                    {canManagePasskeys &&
                        (passkeyUnavailableHint ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="inline-flex w-full">
                                        {passkeyButton}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {passkeyUnavailableHint}
                                </TooltipContent>
                            </Tooltip>
                        ) : (
                            passkeyButton
                        ))}
                    {canManagePasskeys && passkeyErrorMessage ? (
                        <FieldError id="passkey-error">
                            {passkeyErrorMessage}
                        </FieldError>
                    ) : null}
                    <FieldSeparator className="my-0">
                        {t('auth.login.orContinueWithEmail')}
                    </FieldSeparator>
                </div>
            )}

            <Form
                {...store.form()}
                resetOnSuccess={['password']}
                className="flex flex-col gap-6"
                noValidate
            >
                {({ processing, errors }) => (
                    <>
                        <FieldGroup className="gap-6">
                            <Field
                                data-invalid={errors.email ? true : undefined}
                            >
                                <FieldLabel htmlFor="email">
                                    {t('common.emailAddress')}
                                </FieldLabel>
                                <Input
                                    id="email"
                                    type="email"
                                    name="email"
                                    required
                                    // eslint-disable-next-line jsx-a11y/no-autofocus -- focus primary field when surface opens
                                    autoFocus
                                    autoComplete="email"
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
                                <div className="flex items-center">
                                    <FieldLabel htmlFor="password">
                                        {t('common.password')}
                                    </FieldLabel>
                                    {canResetPassword && (
                                        <TextLink
                                            href={request()}
                                            className="ml-auto text-sm"
                                        >
                                            {t('auth.login.forgotPassword')}
                                        </TextLink>
                                    )}
                                </div>
                                <PasswordInput
                                    id="password"
                                    name="password"
                                    required
                                    autoComplete="current-password"
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

                            <Field orientation="horizontal">
                                <Checkbox id="remember" name="remember" />
                                <FieldLabel htmlFor="remember">
                                    {t('auth.login.rememberMe')}
                                </FieldLabel>
                            </Field>

                            <Button
                                type="submit"
                                className="mt-4 w-full"
                                disabled={processing}
                                aria-busy={processing || undefined}
                                data-test="login-button"
                            >
                                {processing && <Spinner />}
                                {processing ? (
                                    <span className="sr-only" role="status">
                                        {t('a11y.loading')}
                                    </span>
                                ) : null}
                                {t('auth.login.submit')}
                            </Button>
                        </FieldGroup>

                        {canRegister && (
                            <div className="text-center text-sm text-muted-foreground">
                                {t('auth.login.noAccount')}{' '}
                                <TextLink href={register()}>
                                    {t('auth.login.signUp')}
                                </TextLink>
                            </div>
                        )}
                    </>
                )}
            </Form>

            {status && (
                <Alert variant="success" role="status" className="mb-4">
                    <CircleCheck />
                    <AlertTitle className="line-clamp-none">
                        {status}
                    </AlertTitle>
                </Alert>
            )}
        </AuthLayout>
    );
}

import { Form, Head, router } from '@inertiajs/react';
import { UserCancelledError } from '@laravel/passkeys';
import { usePasskeyVerify } from '@laravel/passkeys/react';
import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import InputError from '@/components/input-error';
import PasswordInput from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import AuthLayout from '@/layouts/auth-layout';
import { confirm, confirmOptions } from '@/routes/passkey';
import { store } from '@/routes/password/confirm';

type Props = {
    canManagePasskeys?: boolean;
    hasPasskeys?: boolean;
};

/**
 * Confirm password before sensitive actions, with optional passkey confirmation.
 *
 * Passkey confirm is click-only (`autofill: false`) — same lesson as login: shared
 * package isLoading must not hang the page on mount. Password form stays usable
 * while a passkey ceremony is in progress.
 */
export default function ConfirmPassword({
    canManagePasskeys = false,
    hasPasskeys = false,
}: Props) {
    const { t } = useTranslation();

    const {
        verify,
        isLoading: verifyingPasskey,
        error: passkeyError,
        errorInstance: passkeyErrorInstance,
        isSupported: passkeysSupported,
    } = usePasskeyVerify({
        // ponytail: no autofill on confirm — package isLoading would block the CTA
        // until a hung ceremony resolves; upgrade path: Passkeys.autofill() separately.
        autofill: false,
        routes: {
            options: confirmOptions.url(),
            submit: confirm.url(),
        },
        onSuccess: (response) => {
            if (response.redirect) {
                router.visit(response.redirect);
            } else {
                router.visit('/');
            }
        },
    });

    const showPasskeyConfirm =
        canManagePasskeys && hasPasskeys && passkeysSupported;

    const passkeyErrorMessage =
        passkeyErrorInstance instanceof UserCancelledError
            ? t('auth.confirmPassword.passkeyCancelled')
            : passkeyError;

    return (
        <AuthLayout
            title={t('auth.confirmPassword.title')}
            description={t('auth.confirmPassword.description')}
        >
            <Head title={t('auth.confirmPassword.head')} />

            <Form {...store.form()} resetOnSuccess={['password']}>
                {({ processing, errors }) => (
                    <div className="space-y-6">
                        <div className="grid gap-2">
                            <Label htmlFor="password">
                                {t('common.password')}
                            </Label>
                            <PasswordInput
                                id="password"
                                name="password"
                                placeholder={t('common.password')}
                                autoComplete="current-password"
                                autoFocus
                            />

                            <InputError message={errors.password} />
                        </div>

                        <div className="flex items-center">
                            <Button
                                className="w-full"
                                disabled={processing}
                                data-test="confirm-password-button"
                            >
                                {processing && <Spinner />}
                                {t('auth.confirmPassword.submit')}
                            </Button>
                        </div>
                    </div>
                )}
            </Form>

            {showPasskeyConfirm && (
                <div className="mt-6 flex flex-col gap-3">
                    <div className="relative py-1">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">
                                {t('auth.confirmPassword.orConfirmWithPasskey')}
                            </span>
                        </div>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={verifyingPasskey}
                        data-test="passkey-confirm-button"
                        aria-busy={verifyingPasskey}
                        onClick={() => void verify()}
                    >
                        {verifyingPasskey ? <Spinner /> : <KeyRound />}
                        {t('auth.confirmPassword.passkey')}
                    </Button>
                    <InputError message={passkeyErrorMessage} />
                </div>
            )}
        </AuthLayout>
    );
}

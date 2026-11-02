import { Form, Head } from '@inertiajs/react';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
} from '@/components/ui/input-otp';
import { OTP_MAX_LENGTH } from '@/hooks/use-two-factor-auth';
import AuthLayout from '@/layouts/auth-layout';
import { store } from '@/routes/two-factor/login';

/**
 * Two-factor authentication challenge during login.
 */
export default function TwoFactorChallenge() {
    const { t } = useTranslation();
    const [showRecoveryInput, setShowRecoveryInput] = useState<boolean>(false);
    const [code, setCode] = useState<string>('');

    const authConfigContent = useMemo<{
        title: string;
        description: string;
        toggleText: string;
    }>(() => {
        if (showRecoveryInput) {
            return {
                title: t('auth.twoFactorChallenge.recoveryTitle'),
                description: t('auth.twoFactorChallenge.recoveryDescription'),
                toggleText: t('auth.twoFactorChallenge.recoveryToggle'),
            };
        }

        return {
            title: t('auth.twoFactorChallenge.authTitle'),
            description: t('auth.twoFactorChallenge.authDescription'),
            toggleText: t('auth.twoFactorChallenge.authToggle'),
        };
    }, [showRecoveryInput, t]);

    const toggleRecoveryMode = (clearErrors: () => void): void => {
        setShowRecoveryInput(!showRecoveryInput);
        clearErrors();
        setCode('');
    };

    return (
        <AuthLayout
            title={authConfigContent.title}
            description={authConfigContent.description}
        >
            <Head title={t('auth.twoFactorChallenge.head')} />

            <div className="space-y-6">
                <Form
                    {...store.form()}
                    className="space-y-4"
                    resetOnError
                    resetOnSuccess={!showRecoveryInput}
                    noValidate
                >
                    {({ errors, processing, clearErrors }) => (
                        <FieldGroup className="gap-4">
                            {showRecoveryInput ? (
                                <Field
                                    data-invalid={
                                        errors.recovery_code ? true : undefined
                                    }
                                >
                                    <Input
                                        id="recovery_code"
                                        name="recovery_code"
                                        type="text"
                                        aria-label={t(
                                            'auth.twoFactorChallenge.recoveryPlaceholder',
                                        )}
                                        placeholder={t(
                                            'auth.twoFactorChallenge.recoveryPlaceholder',
                                        )}
                                        // eslint-disable-next-line jsx-a11y/no-autofocus -- focus primary field when surface opens
                                        autoFocus={showRecoveryInput}
                                        required
                                        aria-invalid={
                                            errors.recovery_code
                                                ? true
                                                : undefined
                                        }
                                        aria-describedby={
                                            errors.recovery_code
                                                ? 'recovery-code-error'
                                                : undefined
                                        }
                                    />
                                    <FieldError id="recovery-code-error">
                                        {errors.recovery_code}
                                    </FieldError>
                                </Field>
                            ) : (
                                <Field
                                    className="items-center justify-center text-center"
                                    data-invalid={
                                        errors.code ? true : undefined
                                    }
                                >
                                    <div className="flex w-full items-center justify-center">
                                        <InputOTP
                                            name="code"
                                            maxLength={OTP_MAX_LENGTH}
                                            value={code}
                                            onChange={(value) => setCode(value)}
                                            disabled={processing}
                                            pattern={REGEXP_ONLY_DIGITS}
                                            aria-label={t(
                                                'auth.twoFactorChallenge.authTitle',
                                            )}
                                            aria-invalid={
                                                errors.code ? true : undefined
                                            }
                                            aria-describedby={
                                                errors.code
                                                    ? 'code-error'
                                                    : undefined
                                            }
                                        >
                                            <InputOTPGroup>
                                                {Array.from(
                                                    { length: OTP_MAX_LENGTH },
                                                    (_, index) => (
                                                        <InputOTPSlot
                                                            key={index}
                                                            index={index}
                                                        />
                                                    ),
                                                )}
                                            </InputOTPGroup>
                                        </InputOTP>
                                    </div>
                                    <FieldError id="code-error">
                                        {errors.code}
                                    </FieldError>
                                </Field>
                            )}

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={processing}
                                aria-busy={processing || undefined}
                            >
                                {processing ? (
                                    <span className="sr-only" role="status">
                                        {t('a11y.loading')}
                                    </span>
                                ) : null}
                                {t('common.continue')}
                            </Button>

                            <div className="text-center text-sm text-muted-foreground">
                                <span>
                                    {t('auth.twoFactorChallenge.orYouCan')}
                                </span>
                                <button
                                    type="button"
                                    className="cursor-pointer text-foreground underline decoration-muted-foreground underline-offset-4 transition-colors duration-300 ease-out hover:decoration-current!"
                                    onClick={() =>
                                        toggleRecoveryMode(clearErrors)
                                    }
                                >
                                    {authConfigContent.toggleText}
                                </button>
                            </div>
                        </FieldGroup>
                    )}
                </Form>
            </div>
        </AuthLayout>
    );
}

import { Transition } from '@headlessui/react';
import { Form, Head, router } from '@inertiajs/react';
import { UserCancelledError } from '@laravel/passkeys';
import { usePasskeyRegister } from '@laravel/passkeys/react';
import { KeyRound, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SecurityController from '@/actions/App/Http/Controllers/Settings/SecurityController';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import PasswordInput from '@/components/password-input';
import TwoFactorRecoveryCodes from '@/components/two-factor-recovery-codes';
import TwoFactorSetupModal from '@/components/two-factor-setup-modal';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTwoFactorAuth } from '@/hooks/use-two-factor-auth';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { destroy as destroyPasskey } from '@/routes/passkey';
import { edit } from '@/routes/security';
import { disable, enable } from '@/routes/two-factor';
import type { BreadcrumbItem } from '@/types';

type PasskeyItem = {
    id: number;
    name: string;
    created_at: string | null;
    last_used_at: string | null;
};

type Props = {
    canManageTwoFactor?: boolean;
    canManagePasskeys?: boolean;
    requiresConfirmation?: boolean;
    twoFactorEnabled?: boolean;
    twoFactorRequired?: boolean;
    twoFactorEnforcedForUser?: boolean;
    passkeys?: PasskeyItem[];
};

/**
 * Password, two-factor, and passkey security settings.
 */
export default function Security({
    canManageTwoFactor = false,
    canManagePasskeys = false,
    requiresConfirmation = false,
    twoFactorEnabled = false,
    twoFactorEnforcedForUser = false,
    passkeys = [],
}: Props) {
    const { t } = useTranslation();
    const passwordInput = useRef<HTMLInputElement>(null);
    const currentPasswordInput = useRef<HTMLInputElement>(null);
    const [passkeyName, setPasskeyName] = useState('');
    const [deletingPasskeyId, setDeletingPasskeyId] = useState<number | null>(
        null,
    );

    const {
        qrCodeSvg,
        hasSetupData,
        manualSetupKey,
        clearSetupData,
        fetchSetupData,
        recoveryCodesList,
        fetchRecoveryCodes,
        errors,
    } = useTwoFactorAuth();
    const [showSetupModal, setShowSetupModal] = useState<boolean>(false);

    const {
        register: registerPasskey,
        isLoading: registeringPasskey,
        error: registerPasskeyError,
        errorInstance: registerPasskeyErrorInstance,
        isSupported: passkeysSupported,
    } = usePasskeyRegister({
        onSuccess: () => {
            setPasskeyName('');
            router.reload({ only: ['passkeys', 'twoFactorEnforcedForUser'] });
        },
        onError: (error) => {
            // User dismissed the platform prompt — not a server failure.
            if (error instanceof UserCancelledError) {
                return;
            }
        },
    });

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('settings.security.breadcrumb'),
            href: edit(),
        },
    ];

    const registerErrorMessage =
        registerPasskeyErrorInstance instanceof UserCancelledError
            ? null
            : registerPasskeyError;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('settings.security.head')} />

            <h1 className="sr-only">{t('settings.security.head')}</h1>

            <SettingsLayout>
                <div className="space-y-10">
                    {twoFactorEnforcedForUser && (
                        <Alert data-test="two-factor-required-banner">
                            <ShieldAlert />
                            <AlertTitle>
                                {t('settings.security.requiredBannerTitle')}
                            </AlertTitle>
                            <AlertDescription>
                                {t(
                                    'settings.security.requiredBannerDescription',
                                )}
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="space-y-6">
                        <Heading
                            variant="small"
                            title={t('settings.security.passwordTitle')}
                            description={t(
                                'settings.security.passwordDescription',
                            )}
                        />

                        <Form
                            {...SecurityController.update.form()}
                            options={{
                                preserveScroll: true,
                            }}
                            resetOnError={[
                                'password',
                                'password_confirmation',
                                'current_password',
                            ]}
                            resetOnSuccess
                            onError={(formErrors) => {
                                if (formErrors.password) {
                                    passwordInput.current?.focus();
                                }

                                if (formErrors.current_password) {
                                    currentPasswordInput.current?.focus();
                                }
                            }}
                            className="space-y-6"
                        >
                            {({
                                errors: formErrors,
                                processing,
                                recentlySuccessful,
                            }) => (
                                <>
                                    <div className="grid gap-2">
                                        <Label htmlFor="current_password">
                                            {t(
                                                'settings.security.currentPassword',
                                            )}
                                        </Label>

                                        <PasswordInput
                                            id="current_password"
                                            ref={currentPasswordInput}
                                            name="current_password"
                                            className="mt-1 block w-full"
                                            autoComplete="current-password"
                                            placeholder={t(
                                                'settings.security.currentPassword',
                                            )}
                                        />

                                        <InputError
                                            message={
                                                formErrors.current_password
                                            }
                                        />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="password">
                                            {t('settings.security.newPassword')}
                                        </Label>

                                        <PasswordInput
                                            id="password"
                                            ref={passwordInput}
                                            name="password"
                                            className="mt-1 block w-full"
                                            autoComplete="new-password"
                                            placeholder={t(
                                                'settings.security.newPassword',
                                            )}
                                        />

                                        <InputError
                                            message={formErrors.password}
                                        />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="password_confirmation">
                                            {t('common.confirmPassword')}
                                        </Label>

                                        <PasswordInput
                                            id="password_confirmation"
                                            name="password_confirmation"
                                            className="mt-1 block w-full"
                                            autoComplete="new-password"
                                            placeholder={t(
                                                'common.confirmPassword',
                                            )}
                                        />

                                        <InputError
                                            message={
                                                formErrors.password_confirmation
                                            }
                                        />
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <Button
                                            disabled={processing}
                                            data-test="update-password-button"
                                        >
                                            {t(
                                                'settings.security.savePassword',
                                            )}
                                        </Button>

                                        <Transition
                                            show={recentlySuccessful}
                                            enter="transition ease-in-out"
                                            enterFrom="opacity-0"
                                            leave="transition ease-in-out"
                                            leaveTo="opacity-0"
                                        >
                                            <p className="text-sm text-neutral-600">
                                                {t('common.saved')}
                                            </p>
                                        </Transition>
                                    </div>
                                </>
                            )}
                        </Form>
                    </div>

                    {canManageTwoFactor && (
                        <>
                            <Separator />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t(
                                        'settings.security.twoFactorTitle',
                                    )}
                                    description={t(
                                        'settings.security.twoFactorDescription',
                                    )}
                                />
                                {twoFactorEnabled ? (
                                    <div className="flex flex-col items-start justify-start space-y-4">
                                        <p className="text-sm text-muted-foreground">
                                            {t('settings.security.enabledHint')}
                                        </p>

                                        <div className="relative inline">
                                            <Form {...disable.form()}>
                                                {({ processing }) => (
                                                    <Button
                                                        variant="destructive"
                                                        type="submit"
                                                        disabled={processing}
                                                    >
                                                        {t(
                                                            'settings.security.disable2fa',
                                                        )}
                                                    </Button>
                                                )}
                                            </Form>
                                        </div>

                                        <TwoFactorRecoveryCodes
                                            recoveryCodesList={
                                                recoveryCodesList
                                            }
                                            fetchRecoveryCodes={
                                                fetchRecoveryCodes
                                            }
                                            errors={errors}
                                        />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-start justify-start space-y-4">
                                        <p className="text-sm text-muted-foreground">
                                            {t(
                                                'settings.security.disabledHint',
                                            )}
                                        </p>

                                        <div>
                                            {hasSetupData ? (
                                                <Button
                                                    onClick={() =>
                                                        setShowSetupModal(true)
                                                    }
                                                >
                                                    <ShieldCheck />
                                                    {t(
                                                        'settings.security.continueSetup',
                                                    )}
                                                </Button>
                                            ) : (
                                                <Form
                                                    {...enable.form()}
                                                    onSuccess={() =>
                                                        setShowSetupModal(true)
                                                    }
                                                >
                                                    {({ processing }) => (
                                                        <Button
                                                            type="submit"
                                                            disabled={
                                                                processing
                                                            }
                                                        >
                                                            {t(
                                                                'settings.security.enable2fa',
                                                            )}
                                                        </Button>
                                                    )}
                                                </Form>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <TwoFactorSetupModal
                                    isOpen={showSetupModal}
                                    onClose={() => setShowSetupModal(false)}
                                    requiresConfirmation={requiresConfirmation}
                                    twoFactorEnabled={twoFactorEnabled}
                                    qrCodeSvg={qrCodeSvg}
                                    manualSetupKey={manualSetupKey}
                                    clearSetupData={clearSetupData}
                                    fetchSetupData={fetchSetupData}
                                    errors={errors}
                                />
                            </div>
                        </>
                    )}

                    {canManagePasskeys && (
                        <>
                            <Separator />

                            <div
                                className="space-y-6"
                                data-test="passkeys-section"
                            >
                                <Heading
                                    variant="small"
                                    title={t('settings.security.passkeysTitle')}
                                    description={t(
                                        'settings.security.passkeysDescription',
                                    )}
                                />

                                {passkeys.length > 0 ? (
                                    <ul className="divide-y divide-border rounded-md border">
                                        {passkeys.map((passkey) => (
                                            <li
                                                key={passkey.id}
                                                className="flex items-center justify-between gap-4 px-4 py-3"
                                                data-test="passkey-item"
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium">
                                                        {passkey.name}
                                                    </p>
                                                    {passkey.created_at && (
                                                        <p className="text-xs text-muted-foreground">
                                                            {t(
                                                                'settings.security.passkeyCreated',
                                                                {
                                                                    date: new Date(
                                                                        passkey.created_at,
                                                                    ).toLocaleString(),
                                                                },
                                                            )}
                                                        </p>
                                                    )}
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    size="sm"
                                                    disabled={
                                                        deletingPasskeyId ===
                                                        passkey.id
                                                    }
                                                    data-test="delete-passkey-button"
                                                    onClick={() => {
                                                        setDeletingPasskeyId(
                                                            passkey.id,
                                                        );
                                                        router.delete(
                                                            destroyPasskey.url(
                                                                passkey.id,
                                                            ),
                                                            {
                                                                preserveScroll: true,
                                                                onFinish: () =>
                                                                    setDeletingPasskeyId(
                                                                        null,
                                                                    ),
                                                            },
                                                        );
                                                    }}
                                                >
                                                    {deletingPasskeyId ===
                                                        passkey.id && (
                                                        <Spinner />
                                                    )}
                                                    {t(
                                                        'settings.security.deletePasskey',
                                                    )}
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        {t('settings.security.passkeysEmpty')}
                                    </p>
                                )}

                                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                    <div className="grid flex-1 gap-2">
                                        <Label htmlFor="passkey_name">
                                            {t('settings.security.passkeyName')}
                                        </Label>
                                        <Input
                                            id="passkey_name"
                                            value={passkeyName}
                                            onChange={(event) =>
                                                setPasskeyName(
                                                    event.target.value,
                                                )
                                            }
                                            placeholder={t(
                                                'settings.security.passkeyNamePlaceholder',
                                            )}
                                            disabled={
                                                !passkeysSupported ||
                                                registeringPasskey
                                            }
                                            data-test="passkey-name-input"
                                        />
                                    </div>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className="inline-flex">
                                                <Button
                                                    type="button"
                                                    disabled={
                                                        !passkeysSupported ||
                                                        registeringPasskey ||
                                                        passkeyName.trim() ===
                                                            ''
                                                    }
                                                    data-test="add-passkey-button"
                                                    onClick={() =>
                                                        void registerPasskey(
                                                            passkeyName.trim(),
                                                        )
                                                    }
                                                >
                                                    {registeringPasskey ? (
                                                        <Spinner />
                                                    ) : (
                                                        <KeyRound />
                                                    )}
                                                    {t(
                                                        'settings.security.addPasskey',
                                                    )}
                                                </Button>
                                            </span>
                                        </TooltipTrigger>
                                        {!passkeysSupported && (
                                            <TooltipContent>
                                                {typeof window !==
                                                    'undefined' &&
                                                !window.isSecureContext
                                                    ? t(
                                                          'settings.security.passkeysNeedHttps',
                                                      )
                                                    : t(
                                                          'settings.security.passkeysUnsupported',
                                                      )}
                                            </TooltipContent>
                                        )}
                                    </Tooltip>
                                </div>

                                <InputError message={registerErrorMessage} />
                            </div>
                        </>
                    )}
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}

import { Form, Head, Link, usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import NotificationPreferencesController from '@/actions/App/Http/Controllers/Settings/NotificationPreferencesController';
import ProfileController from '@/actions/App/Http/Controllers/Settings/ProfileController';
import DeleteUser from '@/components/delete-user';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { SettingsFormActions } from '@/components/settings-form-actions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import {
    playTestSound,
    setNotificationSoundPrefs,
    unlockNotificationSound,
} from '@/lib/notification-sound';
import { wayfinderInertiaFormProps } from '@/lib/wayfinder-form';
import { edit } from '@/routes/profile';
import { send } from '@/routes/verification';
import type { BreadcrumbItem } from '@/types';

type NotificationSounds = {
    sound_chat_enabled: boolean;
    sound_notifications_enabled: boolean;
};

/**
 * User profile settings page.
 */
export default function Profile({
    mustVerifyEmail,
    status,
    notificationSounds,
}: {
    mustVerifyEmail: boolean;
    status?: string;
    notificationSounds: NotificationSounds;
}) {
    const { t } = useTranslation();
    const { auth } = usePage().props;
    const user = auth.user;
    const [soundChatEnabled, setSoundChatEnabled] = useState(
        notificationSounds.sound_chat_enabled,
    );
    const [soundNotificationsEnabled, setSoundNotificationsEnabled] = useState(
        notificationSounds.sound_notifications_enabled,
    );

    // Keep local toggles + module prefs in sync after Inertia save/shared props refresh.
    useEffect(() => {
        setSoundChatEnabled(notificationSounds.sound_chat_enabled);
        setSoundNotificationsEnabled(
            notificationSounds.sound_notifications_enabled,
        );
        setNotificationSoundPrefs(notificationSounds);
    }, [
        notificationSounds.sound_chat_enabled,
        notificationSounds.sound_notifications_enabled,
    ]);

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('settings.profile.breadcrumb'),
            href: edit(),
        },
    ];

    if (!user) {
        return null;
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('settings.profile.head')} />

            <h1 className="sr-only">{t('settings.profile.head')}</h1>

            <SettingsLayout>
                <div className="space-y-10">
                    <div className="space-y-6">
                        <Heading
                            variant="small"
                            title={t('settings.profile.title')}
                            description={t('settings.profile.description')}
                        />

                        <Form
                            {...wayfinderInertiaFormProps(
                                ProfileController.update,
                                undefined,
                                'patch',
                            )}
                            options={{
                                preserveScroll: true,
                            }}
                            className="space-y-6"
                        >
                            {({ processing, recentlySuccessful, errors }) => (
                                <>
                                    <div className="grid gap-2">
                                        <Label htmlFor="first_name">
                                            {t('common.firstName')}
                                        </Label>

                                        <Input
                                            id="first_name"
                                            className="mt-1 block w-full"
                                            defaultValue={user.first_name}
                                            name="first_name"
                                            required
                                            autoComplete="given-name"
                                            placeholder={t('common.firstName')}
                                        />

                                        <InputError
                                            className="mt-2"
                                            message={errors.first_name}
                                        />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="last_name">
                                            {t('common.lastName')}
                                        </Label>

                                        <Input
                                            id="last_name"
                                            className="mt-1 block w-full"
                                            defaultValue={user.last_name ?? ''}
                                            name="last_name"
                                            required
                                            autoComplete="family-name"
                                            placeholder={t('common.lastName')}
                                        />

                                        <InputError
                                            className="mt-2"
                                            message={errors.last_name}
                                        />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="email">
                                            {t('common.emailAddress')}
                                        </Label>

                                        <Input
                                            id="email"
                                            type="email"
                                            className="mt-1 block w-full"
                                            defaultValue={user.email}
                                            name="email"
                                            required
                                            autoComplete="username"
                                            placeholder={t(
                                                'common.emailAddress',
                                            )}
                                        />

                                        <InputError
                                            className="mt-2"
                                            message={errors.email}
                                        />
                                    </div>

                                    {mustVerifyEmail &&
                                        user.email_verified_at === null && (
                                            <div>
                                                <p className="-mt-4 text-sm text-muted-foreground">
                                                    {t(
                                                        'settings.profile.unverified',
                                                    )}{' '}
                                                    <Link
                                                        href={send()}
                                                        as="button"
                                                        className="text-foreground underline decoration-neutral-300 underline-offset-4 transition-colors duration-300 ease-out hover:decoration-current! dark:decoration-neutral-500"
                                                    >
                                                        {t(
                                                            'settings.profile.resend',
                                                        )}
                                                    </Link>
                                                </p>

                                                {status ===
                                                    'verification-link-sent' && (
                                                    <div className="mt-2 text-sm font-medium text-green-600">
                                                        {t(
                                                            'settings.profile.linkSent',
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                    <SettingsFormActions
                                        processing={processing}
                                        recentlySuccessful={
                                            recentlySuccessful
                                        }
                                        data-test="update-profile-button"
                                    />
                                </>
                            )}
                        </Form>
                    </div>

                    <Separator />

                    <div className="space-y-6">
                        <Heading
                            variant="small"
                            title={t('settings.notificationSounds.title')}
                            description={t(
                                'settings.notificationSounds.description',
                            )}
                        />

                        <Form
                            {...wayfinderInertiaFormProps(
                                NotificationPreferencesController.update,
                                undefined,
                                'patch',
                            )}
                            options={{ preserveScroll: true }}
                            className="space-y-6"
                        >
                            {({ processing, recentlySuccessful, errors }) => (
                                <>
                                    <input
                                        type="hidden"
                                        name="sound_chat_enabled"
                                        value={soundChatEnabled ? '1' : '0'}
                                    />
                                    <input
                                        type="hidden"
                                        name="sound_notifications_enabled"
                                        value={
                                            soundNotificationsEnabled
                                                ? '1'
                                                : '0'
                                        }
                                    />

                                    <div className="flex items-start gap-3">
                                        <Checkbox
                                            id="sound_chat_enabled"
                                            checked={soundChatEnabled}
                                            onCheckedChange={(value) => {
                                                const enabled = value === true;
                                                setSoundChatEnabled(enabled);
                                                setNotificationSoundPrefs({
                                                    sound_chat_enabled: enabled,
                                                    sound_notifications_enabled:
                                                        soundNotificationsEnabled,
                                                });

                                                if (enabled) {
                                                    unlockNotificationSound();
                                                }
                                            }}
                                        />
                                        <div className="grid gap-1">
                                            <Label
                                                htmlFor="sound_chat_enabled"
                                                className="font-normal"
                                            >
                                                {t(
                                                    'settings.notificationSounds.chat',
                                                )}
                                            </Label>
                                            <p className="text-sm text-muted-foreground">
                                                {t(
                                                    'settings.notificationSounds.chatHint',
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <Checkbox
                                            id="sound_notifications_enabled"
                                            checked={
                                                soundNotificationsEnabled
                                            }
                                            onCheckedChange={(value) => {
                                                const enabled = value === true;
                                                setSoundNotificationsEnabled(
                                                    enabled,
                                                );
                                                setNotificationSoundPrefs({
                                                    sound_chat_enabled:
                                                        soundChatEnabled,
                                                    sound_notifications_enabled:
                                                        enabled,
                                                });

                                                if (enabled) {
                                                    unlockNotificationSound();
                                                }
                                            }}
                                        />
                                        <div className="grid gap-1">
                                            <Label
                                                htmlFor="sound_notifications_enabled"
                                                className="font-normal"
                                            >
                                                {t(
                                                    'settings.notificationSounds.notifications',
                                                )}
                                            </Label>
                                            <p className="text-sm text-muted-foreground">
                                                {t(
                                                    'settings.notificationSounds.notificationsHint',
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    <InputError
                                        message={
                                            errors.sound_chat_enabled ??
                                            errors.sound_notifications_enabled
                                        }
                                    />

                                    <div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            data-test="notification-sounds-test"
                                            onClick={() => {
                                                playTestSound();
                                            }}
                                        >
                                            {t(
                                                'settings.notificationSounds.test',
                                            )}
                                        </Button>
                                    </div>

                                    <SettingsFormActions
                                        processing={processing}
                                        recentlySuccessful={
                                            recentlySuccessful
                                        }
                                        data-test="notification-sounds-save"
                                    />
                                </>
                            )}
                        </Form>
                    </div>

                    <Separator />

                    <DeleteUser />
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}

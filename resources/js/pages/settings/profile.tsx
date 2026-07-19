import { Form, Head, Link, usePage } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import ProfileController from '@/actions/App/Http/Controllers/Settings/ProfileController';
import DeleteUser from '@/components/delete-user';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { SettingsFormActions } from '@/components/settings-form-actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { edit } from '@/routes/profile';
import { send } from '@/routes/verification';
import type { BreadcrumbItem } from '@/types';

/**
 * User profile settings page.
 */
export default function Profile({
    mustVerifyEmail,
    status,
}: {
    mustVerifyEmail: boolean;
    status?: string;
}) {
    const { t } = useTranslation();
    const { auth } = usePage().props;
    const user = auth.user;

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
                <div className="space-y-6">
                    <Heading
                        variant="small"
                        title={t('settings.profile.title')}
                        description={t('settings.profile.description')}
                    />

                    <Form
                        {...ProfileController.update.form()}
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
                                        placeholder={t('common.emailAddress')}
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
                                                {t('settings.profile.unverified')}{' '}
                                                <Link
                                                    href={send()}
                                                    as="button"
                                                    className="text-foreground underline decoration-neutral-300 underline-offset-4 transition-colors duration-300 ease-out hover:decoration-current! dark:decoration-neutral-500"
                                                >
                                                    {t('settings.profile.resend')}
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
                                    recentlySuccessful={recentlySuccessful}
                                    data-test="update-profile-button"
                                />
                            </>
                        )}
                    </Form>
                </div>

                <DeleteUser />
            </SettingsLayout>
        </AppLayout>
    );
}

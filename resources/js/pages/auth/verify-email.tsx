import { Form, Head } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import AuthLayout from '@/layouts/auth-layout';
import { logout } from '@/routes';
import { send } from '@/routes/verification';

/**
 * Prompt to verify email after registration.
 */
export default function VerifyEmail({ status }: { status?: string }) {
    const { t } = useTranslation();

    return (
        <AuthLayout
            title={t('auth.verifyEmail.title')}
            description={t('auth.verifyEmail.description')}
        >
            <Head title={t('auth.verifyEmail.head')} />

            {status === 'verification-link-sent' && (
                <div className="mb-4 text-center text-sm font-medium text-green-600">
                    {t('auth.verifyEmail.linkSent')}
                </div>
            )}

            <Form {...send.form()} className="space-y-6 text-center">
                {({ processing }) => (
                    <>
                        <Button disabled={processing} variant="secondary">
                            {processing && <Spinner />}
                            {t('auth.verifyEmail.resend')}
                        </Button>

                        <TextLink
                            href={logout()}
                            className="mx-auto block text-sm"
                        >
                            {t('auth.verifyEmail.logOut')}
                        </TextLink>
                    </>
                )}
            </Form>
        </AuthLayout>
    );
}

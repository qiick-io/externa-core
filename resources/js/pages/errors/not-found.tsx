import { Head, Link } from '@inertiajs/react';
import { FileQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type Props = {
    status?: number;
    homeUrl: string;
};

/**
 * Authenticated 404 page inside the normal app shell.
 */
export default function NotFound({ status = 404, homeUrl }: Props) {
    const { t } = useTranslation();

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('errors.notFound.title'),
            href: homeUrl,
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('errors.notFound.head')} />

            <PageLayout>
                <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
                    <div className="flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                        <FileQuestion className="size-8" aria-hidden />
                    </div>

                    <div className="max-w-md space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">
                            {status}
                        </p>
                        <h1 className="text-2xl font-semibold tracking-tight">
                            {t('errors.notFound.title')}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {t('errors.notFound.description')}
                        </p>
                    </div>

                    <div className="flex flex-wrap justify-center gap-2">
                        <Button asChild variant="default">
                            <Link href={homeUrl}>
                                {t('errors.notFound.goHome')}
                            </Link>
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => window.history.back()}
                        >
                            {t('common.back')}
                        </Button>
                    </div>
                </div>
            </PageLayout>
        </AppLayout>
    );
}

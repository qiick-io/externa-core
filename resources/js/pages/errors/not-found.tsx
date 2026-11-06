import { Head, Link } from '@inertiajs/react';
import { FileQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty';
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
                <Empty data-test="not-found">
                    <EmptyHeader>
                        <p className="text-sm font-medium text-muted-foreground">
                            {status}
                        </p>
                        <EmptyMedia
                            variant="icon"
                            className="bg-primary/10 text-primary"
                        >
                            <FileQuestion />
                        </EmptyMedia>
                        <EmptyTitle>
                            <h1>{t('errors.notFound.title')}</h1>
                        </EmptyTitle>
                        <EmptyDescription>
                            {t('errors.notFound.description')}
                        </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
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
                    </EmptyContent>
                </Empty>
            </PageLayout>
        </AppLayout>
    );
}

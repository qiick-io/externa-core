import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Placeholder rows for a deferred dashboard table while its data loads.
 */
export function DashboardTableSkeleton() {
    const { t } = useTranslation();

    return (
        <div
            role="status"
            aria-label={t('dashboard.loading')}
            className="flex flex-col gap-2"
        >
            {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-8 w-full" />
            ))}
        </div>
    );
}

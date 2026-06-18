import { router } from '@inertiajs/react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type AdminPageLayoutProps = {
    title: string;
    icon?: LucideIcon;
    description?: ReactNode;
    headerExtra?: ReactNode;
    actions?: ReactNode;
    filtersLeft?: ReactNode;
    filtersRight?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    className?: string;
};

export function AdminPageLayout({
    title,
    icon: Icon,
    description,
    headerExtra,
    actions,
    filtersLeft,
    filtersRight,
    children,
    footer,
    className,
}: AdminPageLayoutProps) {
    const showFilterRow = Boolean(filtersLeft || filtersRight);

    return (
        <div className={cn('flex flex-col gap-6 p-4', className)}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex items-center gap-2">
                        {Icon ? <Icon className="size-5 shrink-0" /> : null}
                        <h1 className="text-xl font-semibold tracking-tight">
                            {title}
                        </h1>
                    </div>
                    {description ? (
                        <div className="text-muted-foreground max-w-2xl text-sm">
                            {description}
                        </div>
                    ) : null}
                    {headerExtra}
                </div>
                {actions ? (
                    <div className="flex flex-wrap items-center gap-2">
                        {actions}
                    </div>
                ) : null}
            </div>

            {showFilterRow ? (
                <div className="flex flex-wrap items-center gap-3">
                    {filtersLeft ? (
                        <div className="min-w-0 flex-1">{filtersLeft}</div>
                    ) : null}
                    {filtersRight ? (
                        <div className="flex flex-wrap items-center gap-2">
                            {filtersRight}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {children}

            {footer}
        </div>
    );
}

export function AdminTablePanel({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'rounded-xl border border-sidebar-border/70 bg-card p-1 dark:border-sidebar-border',
                className,
            )}
        >
            {children}
        </div>
    );
}

export type AdminPaginationLink = {
    url: string | null;
    label: string;
    active: boolean;
};

export function AdminPagination({
    links,
}: {
    links: AdminPaginationLink[];
}) {
    if (links.length === 0) {
        return null;
    }

    return (
        <div className="text-muted-foreground flex flex-wrap gap-2 text-sm">
            {links.map((link, index) => (
                <button
                    key={index}
                    type="button"
                    className={link.active ? 'font-semibold underline' : ''}
                    disabled={!link.url}
                    onClick={() => link.url && router.visit(link.url)}
                    dangerouslySetInnerHTML={{ __html: link.label }}
                />
            ))}
        </div>
    );
}

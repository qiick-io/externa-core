import type { ReactNode } from 'react';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { BreadcrumbItem as BreadcrumbItemType } from '@/types';

/**
 * Top bar inside the sidebar layout with collapse trigger, breadcrumbs, and actions.
 * @param {{ breadcrumbs?: BreadcrumbItemType[], actions?: ReactNode }} props - Component props.
 * @param {BreadcrumbItemType[]} [props.breadcrumbs=[]] - Breadcrumb trail.
 * @param {ReactNode} [props.actions] - Optional right-aligned header actions.
 * @returns {JSX.Element}
 */
export function AppSidebarHeader({
    breadcrumbs = [],
    actions,
}: {
    breadcrumbs?: BreadcrumbItemType[];
    actions?: ReactNode;
}) {
    return (
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border/50 px-6 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                <SidebarTrigger className="-ml-1 shrink-0" />
                <Breadcrumbs breadcrumbs={breadcrumbs} />
            </div>
            {actions ? (
                <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5 overflow-x-auto sm:gap-2">
                    {actions}
                </div>
            ) : null}
        </header>
    );
}

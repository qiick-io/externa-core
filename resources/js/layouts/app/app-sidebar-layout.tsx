import { AiFab } from '@/components/ai/ai-fab';
import { AppContent } from '@/components/app-content';
import { AppShell } from '@/components/app-shell';
import { AppSidebar } from '@/components/app-sidebar';
import { AppSidebarHeader } from '@/components/app-sidebar-header';
import type { AppLayoutProps } from '@/types';

/**
 * Authenticated app layout with collapsible sidebar, header bar, and AI FAB.
 * @param {AppLayoutProps} props - Layout props from Inertia pages.
 * @param {React.ReactNode} props.children - Page content.
 * @param {AppLayoutProps['breadcrumbs']} [props.breadcrumbs=[]] - Breadcrumb trail for the header.
 * @param {AppLayoutProps['headerActions']} [props.headerActions] - Optional actions slot in the header.
 * @returns {JSX.Element}
 */
export default function AppSidebarLayout({
    children,
    breadcrumbs = [],
    headerActions,
}: AppLayoutProps) {
    return (
        <AppShell variant="sidebar">
            <AppSidebar />
            <AppContent variant="sidebar" className="overflow-hidden">
                <AppSidebarHeader
                    breadcrumbs={breadcrumbs}
                    actions={headerActions}
                />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {children}
                </div>
            </AppContent>
            <AiFab />
        </AppShell>
    );
}

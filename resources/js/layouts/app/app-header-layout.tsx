import { AppContent } from '@/components/app-content';
import { AppHeader } from '@/components/app-header';
import { AppShell } from '@/components/app-shell';
import type { AppLayoutProps } from '@/types';

/**
 * Authenticated app layout with top header navigation and centered content.
 * @param {AppLayoutProps} props - Layout props from Inertia pages.
 * @param {React.ReactNode} props.children - Page content.
 * @param {AppLayoutProps['breadcrumbs']} [props.breadcrumbs] - Breadcrumb trail for the header.
 * @returns {JSX.Element}
 */
export default function AppHeaderLayout({
    children,
    breadcrumbs,
}: AppLayoutProps) {
    return (
        <AppShell variant="header">
            <AppHeader breadcrumbs={breadcrumbs} />
            <AppContent variant="header">{children}</AppContent>
        </AppShell>
    );
}

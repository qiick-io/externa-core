import AppLayoutTemplate from '@/layouts/app/app-sidebar-layout';
import type { AppLayoutProps } from '@/types';

export default ({
    children,
    breadcrumbs,
    headerActions,
    ...props
}: AppLayoutProps) => (
    <AppLayoutTemplate
        breadcrumbs={breadcrumbs}
        headerActions={headerActions}
        {...props}
    >
        {children}
    </AppLayoutTemplate>
);

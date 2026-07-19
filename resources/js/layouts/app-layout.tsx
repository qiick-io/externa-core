import AppLayoutTemplate from '@/layouts/app/app-sidebar-layout';
import type { AppLayoutProps } from '@/types';

/**
 * Re-export of the sidebar app layout used by Inertia pages via `@/layouts/app-layout`.
 * @param {AppLayoutProps} props - Layout props passed through to the sidebar template.
 * @returns {JSX.Element}
 */
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

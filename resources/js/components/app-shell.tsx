import { usePage } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { AppVariant } from '@/types';

type Props = {
    children: ReactNode;
    variant?: AppVariant;
};

/**
 * Root layout shell: sidebar provider or full-width column for header layout.
 * @param {Props} props - Component props.
 * @param {ReactNode} props.children - App chrome and page tree.
 * @param {AppVariant} [props.variant='sidebar'] - Layout mode from shared page props.
 * @returns {JSX.Element}
 */
export function AppShell({ children, variant = 'sidebar' }: Props) {
    const isOpen = usePage().props.sidebarOpen;

    if (variant === 'header') {
        return (
            <div className="flex min-h-screen w-full flex-col">{children}</div>
        );
    }

    return (
        <SidebarProvider
            defaultOpen={isOpen}
            className="h-svh overflow-hidden"
        >
            {children}
        </SidebarProvider>
    );
}

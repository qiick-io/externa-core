import * as React from 'react';
import { SidebarInset } from '@/components/ui/sidebar';
import type { AppVariant } from '@/types';

type Props = React.ComponentProps<'main'> & {
    variant?: AppVariant;
};

/**
 * Main content region; uses sidebar inset or centered main depending on layout variant.
 * @param {Props} props - Main element props plus layout variant.
 * @param {AppVariant} [props.variant='sidebar'] - Layout mode (`sidebar` or `header`).
 * @param {React.ReactNode} props.children - Page content.
 * @returns {JSX.Element}
 */
export function AppContent({ variant = 'sidebar', children, ...props }: Props) {
    if (variant === 'sidebar') {
        return <SidebarInset {...props}>{children}</SidebarInset>;
    }

    return (
        <main
            className="mx-auto flex h-full w-full max-w-7xl flex-1 flex-col gap-4 rounded-xl"
            {...props}
        >
            {children}
        </main>
    );
}

import * as React from 'react';
import { SidebarInset } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
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
export function AppContent({
    variant = 'sidebar',
    className,
    children,
    ...props
}: Props) {
    if (variant === 'sidebar') {
        // Frame the inset panel: in dark themes it shares the sidebar colour, so without
        // a border the header's bottom rule would end in mid-air.
        return (
            <SidebarInset
                className={cn(
                    'md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:border-sidebar-border/40',
                    className,
                )}
                {...props}
            >
                {children}
            </SidebarInset>
        );
    }

    return (
        <main
            className={cn(
                'mx-auto flex h-full w-full max-w-7xl flex-1 flex-col gap-4 rounded-xl',
                className,
            )}
            {...props}
        >
            {children}
        </main>
    );
}

import {
    CircleCheckIcon,
    InfoIcon,
    Loader2Icon,
    OctagonXIcon,
    TriangleAlertIcon,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * The shadcn `sonner` component, set up for the two channels of `lib/toast.ts`:
 *
 * - Notifications (error, warning, info) sit top-right, below the 4rem header so they never
 *   cover its actions, with rich colours from the theme's status tokens, a close button and
 *   a coloured icon.
 * - Success messages are placed top-centre by `toast.success()` itself (small, plain, short).
 *
 * Changes from shadcn: the app passes `theme` (its resolved appearance) instead of
 * `next-themes`; the icons carry the status colour; the rich colours are the theme's tokens
 * instead of Sonner's own palette; the position, offset, duration and close button are set
 * here so every app mounts `<Toaster theme={…} />` the same way.
 */
function Toaster({ theme = 'system', ...props }: ToasterProps) {
    return (
        <Sonner
            theme={theme}
            className="toaster group"
            position="top-right"
            offset={{ top: '4.5rem' }}
            mobileOffset={{ top: '4.5rem' }}
            duration={5000}
            richColors
            closeButton
            icons={{
                success: <CircleCheckIcon className="size-4 text-success" />,
                info: <InfoIcon className="size-4 text-info" />,
                warning: <TriangleAlertIcon className="size-4 text-warning" />,
                error: <OctagonXIcon className="size-4 text-destructive" />,
                loading: <Loader2Icon className="size-4 animate-spin" />,
            }}
            style={
                {
                    '--normal-bg': 'var(--popover)',
                    '--normal-text': 'var(--popover-foreground)',
                    '--normal-border': 'var(--border)',
                    '--border-radius': 'var(--radius)',
                    '--success-bg':
                        'color-mix(in oklab, var(--success) 10%, var(--popover))',
                    '--success-border':
                        'color-mix(in oklab, var(--success) 40%, var(--popover))',
                    '--success-text': 'var(--popover-foreground)',
                    '--info-bg':
                        'color-mix(in oklab, var(--info) 10%, var(--popover))',
                    '--info-border':
                        'color-mix(in oklab, var(--info) 40%, var(--popover))',
                    '--info-text': 'var(--popover-foreground)',
                    '--warning-bg':
                        'color-mix(in oklab, var(--warning) 12%, var(--popover))',
                    '--warning-border':
                        'color-mix(in oklab, var(--warning) 45%, var(--popover))',
                    '--warning-text': 'var(--popover-foreground)',
                    '--error-bg':
                        'color-mix(in oklab, var(--destructive) 10%, var(--popover))',
                    '--error-border':
                        'color-mix(in oklab, var(--destructive) 40%, var(--popover))',
                    '--error-text': 'var(--popover-foreground)',
                } as CSSProperties
            }
            {...props}
        />
    );
}

export { Toaster };

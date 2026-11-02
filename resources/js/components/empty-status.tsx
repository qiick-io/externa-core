import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type EmptyStatusProps = {
    children: ReactNode;
    className?: string;
};

/**
 * Visible empty-state copy that is also announced once via `role="status"`.
 * Does not hide the parent table/list with `aria-hidden` (#254 / #234).
 */
export function EmptyStatus({ children, className }: EmptyStatusProps) {
    return (
        <span role="status" className={cn(className)}>
            {children}
        </span>
    );
}

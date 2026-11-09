import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type DropOverlayProps = {
    /** Main line ("Drop to attach", "Drop to upload"). */
    title: string;
    /** Optional second, muted line. */
    description?: string;
    icon?: LucideIcon;
    className?: string;
};

/**
 * Dashed "drop files here" overlay shown over a drop target while files are
 * dragged over it (file manager, AI chat, chat send dialog, item chat).
 * The parent must be `relative`; the overlay ignores pointer events and is
 * hidden from assistive tech, since dropping always has a picker alternative.
 */
export function DropOverlay({
    title,
    description,
    icon: Icon,
    className,
}: DropOverlayProps) {
    return (
        <div
            className={cn(
                'pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-primary bg-primary/10',
                className,
            )}
            aria-hidden
            data-slot="drop-overlay"
        >
            <div className="rounded-lg border bg-card px-4 py-3 shadow-lg">
                <p className="flex items-center gap-2 text-sm font-medium">
                    {Icon ? <Icon className="size-4" /> : null}
                    {title}
                </p>
                {description ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                        {description}
                    </p>
                ) : null}
            </div>
        </div>
    );
}

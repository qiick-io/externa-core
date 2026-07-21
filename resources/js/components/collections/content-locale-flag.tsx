import type { ComponentType, SVGProps } from 'react';
import * as Flags from 'country-flag-icons/react/3x2';
import { cn } from '@/lib/utils';

type FlagComponent = ComponentType<SVGProps<SVGSVGElement>>;

const flagMap = Flags as Record<string, FlagComponent>;

/**
 * SVG flag for a content locale (ISO region from catalog).
 * Language-only `en` maps to GB per catalog; no gradient backgrounds.
 */
export function ContentLocaleFlag({
    region,
    className,
    title,
}: {
    region: string;
    className?: string;
    title?: string;
}) {
    const code = region.toUpperCase();
    const Flag = flagMap[code];

    if (!Flag) {
        return (
            <span
                className={cn(
                    'bg-muted text-muted-foreground inline-flex size-4 items-center justify-center rounded-sm text-[9px] font-medium',
                    className,
                )}
                title={title ?? code}
                aria-hidden
            >
                {code.slice(0, 2)}
            </span>
        );
    }

    return (
        <Flag
            className={cn('size-4 shrink-0 rounded-[2px]', className)}
            title={title}
            aria-hidden
        />
    );
}

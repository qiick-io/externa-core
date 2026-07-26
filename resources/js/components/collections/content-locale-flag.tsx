import * as Flags from 'country-flag-icons/react/3x2';
import type { ComponentType, SVGProps } from 'react';
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
                    'inline-flex size-4 items-center justify-center rounded-sm bg-muted text-[9px] font-medium text-muted-foreground',
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
        <span title={title} className="inline-flex">
            <Flag
                className={cn('size-4 shrink-0 rounded-[2px]', className)}
                aria-hidden
            />
        </span>
    );
}

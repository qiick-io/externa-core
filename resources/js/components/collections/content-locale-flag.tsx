import * as Flags from 'country-flag-icons/react/3x2';
import type { ComponentType, SVGProps } from 'react';
import { cn } from '@/lib/utils';

type FlagComponent = ComponentType<SVGProps<SVGSVGElement>>;

const flagMap = Flags as Record<string, FlagComponent>;

/**
 * SVG flag for a content locale (ISO region from catalog).
 * Decorative by default; pass `title` for a text alternative when the flag
 * carries meaning on its own (or when sibling text is insufficient).
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
    const accessibleName = title?.trim() || undefined;

    if (!Flag) {
        if (accessibleName) {
            return (
                <span
                    className={cn(
                        'inline-flex size-4 items-center justify-center rounded-sm bg-muted text-xs font-medium text-muted-foreground',
                        className,
                    )}
                    title={accessibleName}
                    role="img"
                    aria-label={accessibleName}
                >
                    {code.slice(0, 2)}
                </span>
            );
        }

        return (
            <span
                className={cn(
                    'inline-flex size-4 items-center justify-center rounded-sm bg-muted text-xs font-medium text-muted-foreground',
                    className,
                )}
                title={code}
                aria-hidden
            >
                {code.slice(0, 2)}
            </span>
        );
    }

    if (accessibleName) {
        return (
            <span title={accessibleName} className="inline-flex">
                <Flag
                    className={cn('size-4 shrink-0 rounded-[2px]', className)}
                    role="img"
                    aria-label={accessibleName}
                />
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

import * as Flags from 'country-flag-icons/react/3x2';
import type { ComponentType, SVGProps } from 'react';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type FlagComponent = ComponentType<SVGProps<SVGSVGElement>>;

const flagMap = Flags as Record<string, FlagComponent>;

/**
 * SVG flag for a content locale (ISO region from catalog).
 * Decorative by default; pass `title` for a text alternative when the flag
 * carries meaning on its own (or when sibling text is insufficient): it
 * becomes the accessible name and a shadcn `Tooltip`.
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
    const a11yProps = accessibleName
        ? { role: 'img' as const, 'aria-label': accessibleName }
        : { 'aria-hidden': true };

    const flag = Flag ? (
        <span className="inline-flex">
            <Flag
                className={cn('size-4 shrink-0 rounded-[2px]', className)}
                {...a11yProps}
            />
        </span>
    ) : (
        <span
            className={cn(
                'inline-flex size-4 items-center justify-center rounded-sm bg-muted text-xs font-medium text-muted-foreground',
                className,
            )}
            {...a11yProps}
        >
            {code.slice(0, 2)}
        </span>
    );

    if (!accessibleName) {
        return flag;
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>{flag}</TooltipTrigger>
            <TooltipContent>{accessibleName}</TooltipContent>
        </Tooltip>
    );
}

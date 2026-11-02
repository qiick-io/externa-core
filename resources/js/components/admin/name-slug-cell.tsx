import type { ReactNode } from 'react';

import { TruncatedText } from '@/components/admin/truncated-text';
import { cn } from '@/lib/utils';

type NameSlugCellProps = {
    name: string;
    slug?: string | null;
    description?: string | null;
    leading?: ReactNode;
    badge?: ReactNode;
    className?: string;
};

/**
 * Combined primary cell: name, optional mono slug, optional muted description.
 */
export function NameSlugCell({
    name,
    slug,
    description,
    leading,
    badge,
    className,
}: NameSlugCellProps) {
    return (
        <div className={cn('min-w-0', className)}>
            <div className="flex min-w-0 items-center gap-2">
                {leading}
                <TruncatedText text={name} className="font-medium" />
                {badge}
            </div>
            {slug ? (
                <div className="truncate font-mono text-xs text-muted-foreground">
                    {slug}
                </div>
            ) : null}
            {description ? (
                <div
                    className="mt-0.5 line-clamp-2 text-xs text-muted-foreground"
                    title={description}
                >
                    {description}
                </div>
            ) : null}
        </div>
    );
}

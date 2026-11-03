import { ArrowUpRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty';
import { cn } from '@/lib/utils';

type PageEmptyStateProps = {
    icon: LucideIcon;
    /** Plain copy, or wrapped in `EmptyStatus` when the empty result follows a search or filter change. */
    title: ReactNode;
    description: string;
    action?: ReactNode;
    docsHref?: string;
    docsLabel?: string;
    className?: string;
    compact?: boolean;
};

/**
 * Shared admin empty state: Lucide icon (primary tint), title, one-sentence
 * description, one primary CTA, and an optional docs link.
 */
export function PageEmptyState({
    icon: Icon,
    title,
    description,
    action,
    docsHref,
    docsLabel,
    className,
    compact = false,
}: PageEmptyStateProps) {
    return (
        <Empty
            data-testid="page-empty-state"
            className={cn(
                'w-full border border-dashed border-sidebar-border/70 dark:border-sidebar-border',
                compact && 'gap-4 p-6 md:p-6',
                className,
            )}
        >
            <EmptyHeader>
                <EmptyMedia
                    variant="icon"
                    className="bg-primary/10 text-primary"
                >
                    <Icon />
                </EmptyMedia>
                <EmptyTitle className={cn(compact && 'text-base')}>
                    {title}
                </EmptyTitle>
                <EmptyDescription>{description}</EmptyDescription>
            </EmptyHeader>
            {(action || (docsHref && docsLabel)) && (
                <EmptyContent className={cn(compact && 'gap-2')}>
                    {action}
                    {docsHref && docsLabel ? (
                        <Button
                            variant="link"
                            asChild
                            className="text-muted-foreground"
                        >
                            <a href={docsHref} target="_blank" rel="noreferrer">
                                {docsLabel}
                                <ArrowUpRight className="size-3.5" />
                            </a>
                        </Button>
                    ) : null}
                </EmptyContent>
            )}
        </Empty>
    );
}

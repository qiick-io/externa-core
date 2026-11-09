'use client';

import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export type SuggestionsProps = ComponentProps<typeof ScrollArea>;

/**
 * AI Elements `suggestion` (registry.ai-sdk.dev). Change from the registry copy:
 * `shrink-0`, because inside a flex column (the answer bubble) the scroll area
 * has no automatic minimum height and was squeezed below the chips' height,
 * clipping their bottom half.
 */
export const Suggestions = ({
    className,
    children,
    ...props
}: SuggestionsProps) => (
    <ScrollArea
        className="w-full shrink-0 overflow-x-auto whitespace-nowrap"
        {...props}
    >
        <div
            className={cn(
                'flex w-max flex-nowrap items-center gap-2',
                className,
            )}
        >
            {children}
        </div>
        <ScrollBar className="hidden" orientation="horizontal" />
    </ScrollArea>
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, 'onClick'> & {
    suggestion: string;
    onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
    suggestion,
    onClick,
    className,
    variant = 'outline',
    size = 'sm',
    children,
    ...props
}: SuggestionProps) => {
    const handleClick = () => {
        onClick?.(suggestion);
    };

    return (
        <Button
            className={cn('cursor-pointer rounded-full px-4', className)}
            onClick={handleClick}
            size={size}
            type="button"
            variant={variant}
            {...props}
        >
            {children || suggestion}
        </Button>
    );
};

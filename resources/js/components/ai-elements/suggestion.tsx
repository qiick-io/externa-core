import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/*
 * AI Elements `suggestion` as shadcn rebuilt it
 * (ui.shadcn.com/docs/ai-elements/base/suggestion): outline `sm` buttons in one
 * row that scrolls sideways, each `shrink-0` so a label never squeezes. A plain
 * scrolling row, not a ScrollArea: inside a flex column a ScrollArea shrank
 * below the buttons' height and clipped them.
 */

export type SuggestionsProps = ComponentProps<'div'>;

export const Suggestions = ({ className, ...props }: SuggestionsProps) => (
    <div
        className={cn(
            'no-scrollbar flex shrink-0 scroll-fade-x gap-2 overflow-x-auto overscroll-x-contain',
            className,
        )}
        {...props}
    />
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, 'onClick'> & {
    /** The prompt sent when the suggestion is chosen. */
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
}: SuggestionProps) => (
    <Button
        className={cn('shrink-0', className)}
        onClick={() => onClick?.(suggestion)}
        size={size}
        type="button"
        variant={variant}
        {...props}
    >
        {children ?? suggestion}
    </Button>
);

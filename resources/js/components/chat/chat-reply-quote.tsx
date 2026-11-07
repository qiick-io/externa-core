import type { ReactNode } from 'react';
import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemTitle,
} from '@/components/ui/item';
import { cn } from '@/lib/utils';

type ChatReplyQuoteProps = {
    author: ReactNode;
    body: ReactNode;
    /** Jump to the quoted message; the quote renders as a button. */
    onSelect?: () => void;
    /** Trailing action, such as the composer's cancel button. */
    action?: ReactNode;
    className?: string;
};

/**
 * The quoted message of a reply, on shadcn `Item` (muted, with a left rule):
 * inside a bubble it jumps to the original, above the composer it carries the
 * cancel action.
 */
export function ChatReplyQuote({
    author,
    body,
    onSelect,
    action,
    className,
}: ChatReplyQuoteProps) {
    const content = (
        <ItemContent className="min-w-0 gap-0 border-l-2 border-border pl-2">
            <ItemTitle className="text-xs">{author}</ItemTitle>
            <ItemDescription className="line-clamp-1 text-xs">
                {body}
            </ItemDescription>
        </ItemContent>
    );
    const itemClassName = cn(
        'w-full flex-nowrap gap-2 px-2 py-1 text-left',
        className,
    );

    if (onSelect) {
        return (
            <Item variant="muted" size="sm" className={itemClassName} asChild>
                <button
                    type="button"
                    data-test="chat-reply-quote"
                    onClick={onSelect}
                >
                    {content}
                </button>
            </Item>
        );
    }

    return (
        <Item
            variant="muted"
            size="sm"
            className={itemClassName}
            data-test="chat-reply-quote"
        >
            {content}
            {action ? <ItemActions>{action}</ItemActions> : null}
        </Item>
    );
}

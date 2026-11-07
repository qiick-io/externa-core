import { ArrowDownIcon } from 'lucide-react';
import { useImperativeHandle } from 'react';
import type { ComponentProps, ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import {
    MessageScroller,
    MessageScrollerButton,
    MessageScrollerContent,
    MessageScrollerProvider,
    MessageScrollerViewport,
    useMessageScroller,
} from '@/components/ui/message-scroller';
import { cn } from '@/lib/utils';

/** Imperative scroller API, for callers that act outside the scroller tree. */
export type ChatMessageScrollerHandle = ReturnType<typeof useMessageScroller>;

type ChatMessageScrollerProps = {
    children: ReactNode;
    /**
     * Follow new content while the reader is at the bottom. The AI surfaces turn
     * it off while an answer streams, so the new prompt stays at the top and the
     * answer grows below it without pulling the reader down.
     */
    autoScroll?: boolean;
    /** Receives `scrollToEnd`, `scrollToMessage` and `scrollToStart`. */
    scrollerRef?: Ref<ChatMessageScrollerHandle>;
    /** Accessible name of the scrolling region (defaults to "Messages"). */
    label?: string;
    className?: string;
    viewportClassName?: string;
    contentClassName?: string;
    /** Content props, e.g. `aria-live="off"` when the caller announces answers itself. */
    contentProps?: Omit<
        ComponentProps<typeof MessageScrollerContent>,
        'children' | 'className'
    >;
    /**
     * Shown over the empty thread. It stays outside the scroller's items, so the
     * first message is handled like any later one.
     */
    empty?: ReactNode;
    /** Extra overlay content pinned above the bottom of the thread (typing, loading). */
    overlay?: ReactNode;
};

function ScrollerHandleBridge({
    scrollerRef,
}: {
    scrollerRef: Ref<ChatMessageScrollerHandle>;
}) {
    const scroller = useMessageScroller();

    useImperativeHandle(scrollerRef, () => scroller, [scroller]);

    return null;
}

/**
 * The conversation scroller of the Assistant page, the Assistant panel and the
 * human chat: shadcn `message-scroller` with the qiick defaults. It opens at the
 * latest message, follows new messages while the reader is at the bottom
 * (`autoScroll`), keeps
 * the reading position when older messages are prepended, scrolls a new
 * `scrollAnchor` item (the user's own AI prompt) to the top, and shows a
 * "scroll to latest" button when the reader has scrolled up.
 *
 * Children must be `MessageScrollerItem`s (plus any status rows), because the
 * scroller tracks its direct children.
 */
export function ChatMessageScroller({
    children,
    autoScroll = true,
    scrollerRef,
    label,
    className,
    viewportClassName,
    contentClassName,
    contentProps,
    empty,
    overlay,
}: ChatMessageScrollerProps) {
    const { t } = useTranslation();

    return (
        <MessageScrollerProvider
            autoScroll={autoScroll}
            defaultScrollPosition="end"
        >
            {scrollerRef ? (
                <ScrollerHandleBridge scrollerRef={scrollerRef} />
            ) : null}
            <MessageScroller className={cn('flex-1', className)}>
                <MessageScrollerViewport
                    aria-label={label ?? t('chatHub.messagesRegion')}
                    className={viewportClassName}
                >
                    <MessageScrollerContent
                        className={cn('gap-4', contentClassName)}
                        {...contentProps}
                    >
                        {children}
                    </MessageScrollerContent>
                </MessageScrollerViewport>
                {empty ? (
                    <div className="absolute inset-0 flex flex-col">
                        {empty}
                    </div>
                ) : null}
                {overlay ? (
                    <div
                        data-test="chat-thread-status"
                        className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex flex-col items-center gap-1"
                    >
                        {overlay}
                    </div>
                ) : null}
                <MessageScrollerButton
                    data-test="chat-scroll-to-latest"
                    className={cn(
                        'z-10 rounded-full shadow-md',
                        overlay ? 'data-[direction=end]:bottom-10' : null,
                    )}
                >
                    <ArrowDownIcon aria-hidden />
                    <span className="sr-only">
                        {t('chatHub.scrollToLatest')}
                    </span>
                </MessageScrollerButton>
            </MessageScroller>
        </MessageScrollerProvider>
    );
}

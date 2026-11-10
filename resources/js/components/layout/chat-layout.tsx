import { ArrowUp } from 'lucide-react';
import { useRef } from 'react';
import type {
    ComponentProps,
    FormEvent,
    KeyboardEvent,
    ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { useAutosizeTextarea } from '@/hooks/use-autosize-textarea';
import {
    COMPOSER_MAX_TEXTAREA_HEIGHT_PX,
    COMPOSER_MIN_TEXTAREA_HEIGHT_PX,
    composerFrameClass,
    composerTextareaClass,
    composerToolbarClass,
} from '@/lib/composer-chrome';
import { cn } from '@/lib/utils';

/** `data-*` attributes (test ids) for one part of {@link ChatLayout}. */
type ChatLayoutPartAttributes = { [key: `data-${string}`]: string | undefined };

export type ChatLayoutProps = Omit<ComponentProps<'div'>, 'children'> & {
    /** Accessible name of the list column (`<aside>`). */
    listLabel: string;
    list: ReactNode;
    /** Centres the list content (empty state, loading). */
    isListCentered?: boolean;
    /**
     * Below `md` the list and the thread take turns, full width: `false`
     * shows the list, `true` the open thread. Omit it to keep both columns
     * side by side at every width.
     */
    isThreadOpen?: boolean;
    /** Extra `data-*` attributes for the list column, the list and the thread. */
    listColumnProps?: ChatLayoutPartAttributes;
    listProps?: ChatLayoutPartAttributes;
    threadProps?: ChatLayoutPartAttributes;
    children: ReactNode;
};

/**
 * Body of a chat page, as on externa-core `/ai` (Assistant) and `/chat`:
 * conversation list on the left, the open thread on the right. Render it as
 * the child of {@link PageLayout}, with the list search in `filters` and the
 * list actions in `filtersRight`. With `isThreadOpen` the page works on a
 * phone: the list or the thread, full width, never both.
 */
export function ChatLayout({
    listLabel,
    list,
    isListCentered = false,
    isThreadOpen,
    listColumnProps,
    listProps,
    threadProps,
    children,
    className,
    ...props
}: ChatLayoutProps) {
    const isSplit = isThreadOpen !== undefined;

    return (
        <div
            data-slot="chat-layout"
            className={cn('flex min-h-0 flex-1 overflow-hidden', className)}
            {...props}
        >
            <aside
                aria-label={listLabel}
                data-slot="chat-layout-list-column"
                className={cn(
                    isSplit
                        ? [
                              'w-full shrink-0 flex-col md:flex md:w-64 md:border-r lg:w-80',
                              isThreadOpen ? 'hidden' : 'flex',
                          ]
                        : 'flex w-64 shrink-0 flex-col border-r lg:w-80',
                )}
                {...listColumnProps}
            >
                <div
                    data-slot="chat-layout-list"
                    className={cn(
                        'min-h-0 flex-1 overflow-y-auto p-2',
                        isListCentered &&
                            'flex flex-col items-center justify-center',
                    )}
                    {...listProps}
                >
                    {list}
                </div>
            </aside>
            <section
                data-slot="chat-layout-thread"
                className={cn(
                    'relative min-h-0 min-w-0 flex-1 flex-col',
                    isSplit
                        ? ['md:flex', isThreadOpen ? 'flex' : 'hidden']
                        : 'flex',
                )}
                {...threadProps}
            >
                {children}
            </section>
        </div>
    );
}

/**
 * Uppercase section label in the list column (e.g. "Pinned", "Today").
 */
export function ChatListSection({
    label,
    icon,
    children,
}: {
    label: ReactNode;
    icon?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="mb-3">
            <div className="flex items-center gap-2 px-2 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {icon}
                {label}
            </div>
            {children}
        </div>
    );
}

/**
 * One conversation row: muted background when selected or hovered.
 */
export function ChatListItem({
    isSelected = false,
    onSelect,
    children,
    className,
}: {
    isSelected?: boolean;
    onSelect: () => void;
    children: ReactNode;
    className?: string;
}) {
    return (
        <button
            type="button"
            aria-current={isSelected || undefined}
            className={cn(
                'mb-0.5 flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted',
                isSelected && 'bg-muted',
                className,
            )}
            onClick={onSelect}
        >
            {children}
        </button>
    );
}

/**
 * Thread pane: scrolling messages above, the composer pinned below.
 */
export function ChatThread({
    children,
    composer,
}: {
    children: ReactNode;
    composer: ReactNode;
}) {
    return (
        <>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
                {children}
            </div>
            <div className="border-t p-3">{composer}</div>
        </>
    );
}

export type ChatComposerProps = {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    /** Accessible name of the textarea. */
    label: string;
    /** Accessible name of the send button. */
    sendLabel: string;
    placeholder?: string;
    disabled?: boolean;
    /** Icon buttons on the left of the action row (attach, presets, …). */
    actions?: ReactNode;
    className?: string;
};

/**
 * Message composer shared by the Assistant and Chat: one rounded frame with an
 * auto-growing textarea and an action row. Enter sends, Shift+Enter adds a line.
 */
export function ChatComposer({
    value,
    onChange,
    onSubmit,
    label,
    sendLabel,
    placeholder,
    disabled = false,
    actions,
    className,
}: ChatComposerProps) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const canSubmit = !disabled && value.trim() !== '';

    useAutosizeTextarea(textareaRef, value);

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();

        if (canSubmit) {
            onSubmit();
        }
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (
            event.key !== 'Enter' ||
            event.shiftKey ||
            event.nativeEvent.isComposing
        ) {
            return;
        }

        event.preventDefault();

        if (canSubmit) {
            onSubmit();
        }
    };

    return (
        <form className={cn('w-full', className)} onSubmit={handleSubmit}>
            <div className={composerFrameClass}>
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    rows={1}
                    className={composerTextareaClass}
                    style={{
                        minHeight: COMPOSER_MIN_TEXTAREA_HEIGHT_PX,
                        maxHeight: COMPOSER_MAX_TEXTAREA_HEIGHT_PX,
                    }}
                    aria-label={label}
                />
                <div className={composerToolbarClass}>
                    <div className="flex items-center gap-1">{actions}</div>
                    <Button
                        type="submit"
                        size="icon"
                        className="rounded-full"
                        disabled={!canSubmit}
                        aria-label={sendLabel}
                    >
                        <ArrowUp className="size-4" />
                    </Button>
                </div>
            </div>
        </form>
    );
}

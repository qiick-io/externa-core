import { useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Command, CommandItem, CommandList } from '@/components/ui/command';
import {
    Popover,
    PopoverAnchor,
    PopoverContent,
} from '@/components/ui/popover';
import { collectionMentionLabel } from '@/lib/item-chat-mentions';
import { cn } from '@/lib/utils';

/** A user or collection offered after `@` in a chat composer. */
export type ChatMentionHit =
    | { type: 'user'; id: number; name: string; email?: string }
    | { type: 'collection'; id: number; name: string };

type ChatMentionMenuProps = {
    /** The composer the list opens above. */
    children: ReactNode;
    open: boolean;
    hits: ChatMentionHit[];
    highlightIndex: number;
    onHighlightChange: (index: number) => void;
    onPick: (hit: ChatMentionHit) => void;
    onDismiss: () => void;
    /** The composer textarea, which keeps the focus while the list is open. */
    textareaRef?: RefObject<HTMLTextAreaElement | null>;
    contentClassName?: string;
};

function hitValue(hit: ChatMentionHit): string {
    return `${hit.type}-${hit.id}`;
}

/**
 * Keyboard handling for the composer textarea while the mention list is open:
 * arrows move the highlight, Enter picks, Escape closes. It calls
 * `preventDefault()` on the keys it takes, so the composer does not send.
 *
 * @returns Whether the key was taken
 */
export function handleMentionMenuKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
    menu: {
        isOpen: boolean;
        hits: ChatMentionHit[];
        highlightIndex: number;
        onHighlightChange: (index: number) => void;
        onPick: (hit: ChatMentionHit) => void;
        onDismiss: () => void;
    },
): boolean {
    if (!menu.isOpen || menu.hits.length === 0) {
        return false;
    }

    const count = menu.hits.length;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        menu.onHighlightChange(
            (menu.highlightIndex +
                (event.key === 'ArrowDown' ? 1 : -1) +
                count) %
                count,
        );

        return true;
    }

    if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey
    ) {
        event.preventDefault();
        const hit = menu.hits[menu.highlightIndex];

        if (hit) {
            menu.onPick(hit);
        }

        return true;
    }

    if (event.key === 'Escape') {
        event.preventDefault();
        menu.onDismiss();

        return true;
    }

    return false;
}

/**
 * The `@` mention list of the chat composer: shadcn Popover + Command
 * (`cmdk` listbox) anchored above the composer. Focus stays in the textarea,
 * which drives the highlight with {@link handleMentionMenuKeyDown} and points
 * at the highlighted option with `aria-activedescendant`.
 */
export function ChatMentionMenu({
    children,
    open,
    hits,
    highlightIndex,
    onHighlightChange,
    onPick,
    onDismiss,
    textareaRef,
    contentClassName,
}: ChatMentionMenuProps) {
    const { t } = useTranslation();
    const contentRef = useRef<HTMLDivElement | null>(null);
    const anchorRef = useRef<HTMLDivElement | null>(null);
    const isOpen = open && hits.length > 0;
    const highlighted = hits[highlightIndex];

    useEffect(() => {
        const textarea = textareaRef?.current;

        if (!textarea) {
            return;
        }

        if (!isOpen) {
            textarea.removeAttribute('aria-controls');
            textarea.removeAttribute('aria-activedescendant');

            return;
        }

        // cmdk owns the list and option ids and renders them after this commit.
        const frame = window.requestAnimationFrame(() => {
            const list =
                contentRef.current?.querySelector<HTMLElement>('[cmdk-list]');
            const option = list?.querySelector<HTMLElement>(
                '[cmdk-item][aria-selected="true"]',
            );

            if (list?.id) {
                textarea.setAttribute('aria-controls', list.id);
            }

            if (option?.id) {
                textarea.setAttribute('aria-activedescendant', option.id);
            }
        });

        return () => window.cancelAnimationFrame(frame);
    }, [isOpen, highlightIndex, hits, textareaRef]);

    return (
        <Popover
            open={isOpen}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    onDismiss();
                }
            }}
        >
            <PopoverAnchor asChild>
                <div ref={anchorRef}>{children}</div>
            </PopoverAnchor>
            <PopoverContent
                ref={contentRef}
                side="top"
                align="start"
                sideOffset={4}
                className={cn(
                    'w-(--radix-popover-trigger-width) p-0',
                    contentClassName,
                )}
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                onInteractOutside={(event) => {
                    // Typing and clicking in the composer must not close the list.
                    if (anchorRef.current?.contains(event.target as Node)) {
                        event.preventDefault();
                    }
                }}
            >
                <Command
                    shouldFilter={false}
                    value={highlighted ? hitValue(highlighted) : ''}
                    onValueChange={(value) => {
                        const index = hits.findIndex(
                            (hit) => hitValue(hit) === value,
                        );

                        if (index >= 0 && index !== highlightIndex) {
                            onHighlightChange(index);
                        }
                    }}
                >
                    <CommandList
                        label={t('collections.itemChat.mention')}
                        className="max-h-40"
                    >
                        {hits.map((hit) => (
                            <CommandItem
                                key={hitValue(hit)}
                                value={hitValue(hit)}
                                className="flex-col items-start gap-0"
                                onSelect={() => onPick(hit)}
                            >
                                <span>
                                    {hit.type === 'collection'
                                        ? collectionMentionLabel(hit)
                                        : hit.name}
                                </span>
                                {hit.type === 'user' && hit.email ? (
                                    <span className="text-xs text-muted-foreground">
                                        {hit.email}
                                    </span>
                                ) : hit.type === 'collection' ? (
                                    <span className="text-xs text-muted-foreground">
                                        {t(
                                            'collections.itemChat.mentionCollection',
                                        )}
                                    </span>
                                ) : null}
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

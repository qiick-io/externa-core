import { Copy, MoreHorizontal, Pencil, Pin, Reply, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import type { ComponentType, ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { REACTION_EMOJIS } from '@/lib/item-chat-api';
import { cn } from '@/lib/utils';

export type ChatMessageActions = {
    canEdit: boolean;
    canDelete: boolean;
    isPinned: boolean;
    onReply: () => void;
    onCopy: () => void;
    onPin: () => void;
    onReact: (emoji: string) => void;
    onEdit: () => void;
    onDelete: () => void;
};

type MenuParts = {
    Item: ComponentType<{
        onSelect?: () => void;
        variant?: 'default' | 'destructive';
        children: ReactNode;
    }>;
    Separator: ComponentType;
};

/** The same reactions and actions in the right-click menu and the ⋯ menu. */
function MessageMenuItems({
    actions,
    parts: { Item, Separator },
}: {
    actions: ChatMessageActions;
    parts: MenuParts;
}) {
    const { t } = useTranslation();

    return (
        <>
            <div
                role="group"
                aria-label={t('collections.itemChat.react')}
                className="flex items-center gap-0.5 px-1 pb-1"
            >
                {REACTION_EMOJIS.map((emoji) => (
                    <Item key={emoji} onSelect={() => actions.onReact(emoji)}>
                        <span className="text-base leading-none">{emoji}</span>
                    </Item>
                ))}
            </div>
            <Separator />
            <Item onSelect={actions.onReply}>
                <Reply />
                {t('collections.itemChat.reply')}
            </Item>
            <Item onSelect={actions.onCopy}>
                <Copy />
                {t('collections.itemChat.copyText')}
            </Item>
            <Item onSelect={actions.onPin}>
                <Pin />
                {actions.isPinned
                    ? t('collections.itemChat.unpin')
                    : t('collections.itemChat.pin')}
            </Item>
            {actions.canEdit ? (
                <Item onSelect={actions.onEdit}>
                    <Pencil />
                    {t('collections.itemChat.edit')}
                </Item>
            ) : null}
            {actions.canDelete ? (
                <Item variant="destructive" onSelect={actions.onDelete}>
                    <Trash2 />
                    {t('common.delete')}
                </Item>
            ) : null}
        </>
    );
}

const contextParts: MenuParts = {
    Item: ({ children, ...props }) => (
        <ContextMenuItem
            className="has-[>span:only-child]:size-7 has-[>span:only-child]:justify-center has-[>span:only-child]:p-0"
            {...props}
        >
            {children}
        </ContextMenuItem>
    ),
    Separator: ContextMenuSeparator,
};

const dropdownParts: MenuParts = {
    Item: ({ children, ...props }) => (
        <DropdownMenuItem
            className="has-[>span:only-child]:size-7 has-[>span:only-child]:justify-center has-[>span:only-child]:p-0"
            {...props}
        >
            {children}
        </DropdownMenuItem>
    ),
    Separator: DropdownMenuSeparator,
};

/**
 * Right-click menu on a chat bubble (reactions, reply, copy, pin, edit,
 * delete). {@link ChatMessageActionsButton} opens the same menu from a
 * visible, keyboard-reachable ⋯ button.
 */
export function ChatMessageContextMenu({
    actions,
    children,
}: {
    actions: ChatMessageActions;
    children: ReactElement;
}) {
    return (
        <ContextMenu modal={false}>
            <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
            <ContextMenuContent
                className="w-52"
                onCloseAutoFocus={(event) => {
                    // Keep Reply→composer focus; avoid restore onto message bubble.
                    event.preventDefault();
                }}
            >
                <MessageMenuItems actions={actions} parts={contextParts} />
            </ContextMenuContent>
        </ContextMenu>
    );
}

/** The visible ⋯ trigger of the message menu, for the message footer. */
export function ChatMessageActionsButton({
    actions,
    align,
    className,
}: {
    actions: ChatMessageActions;
    align: 'start' | 'end';
    className?: string;
}) {
    const { t } = useTranslation();
    // Reply moves focus to the composer; the menu must not pull it back on close.
    const keepFocusOnCloseRef = useRef(false);
    const menuActions: ChatMessageActions = {
        ...actions,
        onReply: () => {
            keepFocusOnCloseRef.current = true;
            actions.onReply();
        },
    };

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    data-test="chat-message-menu"
                    aria-label={t('collections.itemChat.messageActions')}
                    className={cn(
                        'text-muted-foreground opacity-0 group-hover/message:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
                        className,
                    )}
                >
                    <MoreHorizontal />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align={align}
                className="w-52"
                onCloseAutoFocus={(event) => {
                    if (keepFocusOnCloseRef.current) {
                        keepFocusOnCloseRef.current = false;
                        event.preventDefault();
                    }
                }}
            >
                <MessageMenuItems actions={menuActions} parts={dropdownParts} />
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

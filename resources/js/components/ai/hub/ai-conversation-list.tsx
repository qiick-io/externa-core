import { MessagesSquare, MoreHorizontal, Pin, Trash2 } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiConversationList as AiConversationListState } from '@/components/ai/hub/use-ai-conversation-list';
import { ChatListSection } from '@/components/layout/chat-layout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
} from '@/components/ui/empty';
import { Item } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import type { AiConversationSummary } from '@/lib/ai-chat';
import { cn } from '@/lib/utils';

type AiConversationListProps = {
    list: AiConversationListState;
    activeConversationId: string | null;
    onOpenConversation: (id: string) => void;
    onTogglePin: (id: string) => void;
    onRequestDelete: (id: string) => void;
};

/**
 * Sidebar of the AI hub: the grouped conversation rows with their selection
 * checkbox, open button and row menu (pin, delete), the empty state, and
 * "load more".
 * @param {AiConversationListProps} props - Component props.
 * @returns {JSX.Element}
 */
export function AiConversationList({
    list,
    activeConversationId,
    onOpenConversation,
    onTogglePin,
    onRequestDelete,
}: AiConversationListProps) {
    const { t } = useTranslation();

    if (list.conversationItems.length === 0) {
        return (
            <Empty data-test="ai-list-empty" className="gap-3 p-6 md:p-6">
                <EmptyHeader>
                    <EmptyMedia
                        variant="icon"
                        className="bg-primary/10 text-primary"
                    >
                        <MessagesSquare />
                    </EmptyMedia>
                    <EmptyDescription>
                        {list.conversationQuery.trim() !== ''
                            ? t('ai.noConversationsMatch')
                            : t('ai.noConversations')}
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    }

    return (
        <>
            {list.conversationSections.map((section) => (
                <ChatListSection
                    key={section.key}
                    label={section.label}
                    icon={
                        section.key === 'pinned' ? (
                            <Pin className="size-3 fill-current" />
                        ) : null
                    }
                >
                    {section.conversations.map((conversation) => {
                        const index =
                            list.conversationIndexById.get(conversation.id) ??
                            0;

                        return (
                            <AiConversationRow
                                key={conversation.id}
                                conversation={conversation}
                                isActive={
                                    conversation.id === activeConversationId
                                }
                                isSelected={list.selectedIds.has(
                                    conversation.id,
                                )}
                                onCheckboxPointerDown={(event) =>
                                    list.handleCheckboxPointerDown(event, index)
                                }
                                onSelectedChange={(checked) =>
                                    list.toggleSelected(
                                        conversation.id,
                                        checked,
                                        index,
                                    )
                                }
                                onOpen={() =>
                                    onOpenConversation(conversation.id)
                                }
                                onTogglePin={() => onTogglePin(conversation.id)}
                                onRequestDelete={() =>
                                    onRequestDelete(conversation.id)
                                }
                            />
                        );
                    })}
                </ChatListSection>
            ))}
            {list.hasMoreConversations ? (
                <Button
                    type="button"
                    variant="ghost"
                    className="mb-2 w-full text-muted-foreground"
                    disabled={list.isLoadingMore}
                    onClick={() => void list.handleLoadMoreConversations()}
                >
                    {list.isLoadingMore ? <Spinner /> : null}
                    {t('ai.loadMore')}
                </Button>
            ) : null}
        </>
    );
}

type AiConversationRowProps = {
    conversation: AiConversationSummary;
    isActive: boolean;
    isSelected: boolean;
    onCheckboxPointerDown: (event: ReactPointerEvent) => void;
    onSelectedChange: (checked: boolean) => void;
    onOpen: () => void;
    onTogglePin: () => void;
    onRequestDelete: () => void;
};

function AiConversationRow({
    conversation,
    isActive,
    isSelected,
    onCheckboxPointerDown,
    onSelectedChange,
    onOpen,
    onTogglePin,
    onRequestDelete,
}: AiConversationRowProps) {
    const { t } = useTranslation();

    return (
        <Item
            size="sm"
            variant={isActive ? 'muted' : 'default'}
            className={cn(
                'group mb-0.5 flex-nowrap gap-1 p-0',
                isActive ? 'bg-muted' : 'hover:bg-muted/60',
            )}
        >
            <Checkbox
                className="ml-2"
                checked={isSelected}
                onPointerDown={onCheckboxPointerDown}
                onCheckedChange={(checked) =>
                    onSelectedChange(checked === true)
                }
                aria-label={t('ai.selectConversation', {
                    title: conversation.title,
                })}
            />
            <Item
                asChild
                size="sm"
                className="min-w-0 flex-1 flex-nowrap px-2 py-2 text-left"
            >
                <button
                    type="button"
                    data-test="ai-conversation-open"
                    aria-current={isActive ? 'true' : undefined}
                    onClick={onOpen}
                >
                    <span className="min-w-0 truncate">
                        {conversation.title}
                    </span>
                </button>
            </Item>
            {conversation.pinned_at ? (
                <Pin
                    className="size-3.5 shrink-0 fill-current text-muted-foreground group-hover:hidden group-has-[[data-state=open]]:hidden"
                    aria-hidden
                />
            ) : null}
            {/* ChatGPT / Claude style: conversation actions live on the row, not in a pane header. */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                        aria-label={t('a11y.moreActions')}
                        data-test="ai-conversation-menu"
                    >
                        <MoreHorizontal className="size-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={onTogglePin}>
                        <Pin className="size-4" />
                        {conversation.pinned_at
                            ? t('a11y.unpinChat')
                            : t('a11y.pinChat')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        variant="destructive"
                        data-test="ai-conversation-delete"
                        onSelect={onRequestDelete}
                    >
                        <Trash2 className="size-4" />
                        {t('a11y.deleteChat')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </Item>
    );
}

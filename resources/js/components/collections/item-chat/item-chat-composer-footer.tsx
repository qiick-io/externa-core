import { Paperclip, Smile } from 'lucide-react';
import { useRef } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatComposer } from '@/components/chat/chat-composer';
import { ChatEmojiGrid } from '@/components/chat/chat-emoji-grid';
import { ChatMentionHitLabel } from '@/components/chat/chat-mention-hit';
import {
    ChatMentionMenu,
    handleMentionMenuKeyDown,
} from '@/components/chat/chat-mention-menu';
import { ChatReplyQuote } from '@/components/chat/chat-reply-quote';
import { EMOJI_GRID } from '@/components/collections/item-chat/item-chat-format';
import type { ChatMentionMenuState } from '@/components/collections/item-chat/use-chat-composer';
import { Button } from '@/components/ui/button';
import { DrawerFooter } from '@/components/ui/drawer';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import type { ItemChatMessage } from '@/lib/item-chat-api';
import { storedBodyToDraft } from '@/lib/item-chat-mentions';

type ItemChatComposerFooterProps = {
    variant: 'drawer' | 'pane';
    textareaRef: RefObject<HTMLTextAreaElement | null>;
    draft: string;
    /** False while the attachment dialog owns the input, or the draft is blank. */
    canSubmit: boolean;
    replyTo: ItemChatMessage | null;
    onCancelReply: () => void;
    mentionsEnabled: boolean;
    mentionMenu: ChatMentionMenuState;
    emojiOpen: boolean;
    onEmojiOpenChange: (open: boolean) => void;
    onValueChange: (value: string, caret: number) => void;
    onSubmit: () => void;
    insertAtCaret: (text: string) => void;
    insertMentionTrigger: () => void;
    onPickFiles: (fileList: FileList | null) => void;
};

/**
 * Footer of the item chat: the reply quote, the composer with its `@` mention menu,
 * and the mention, emoji and attach buttons. Shift+Space inserts a line break.
 */
export function ItemChatComposerFooter({
    variant,
    textareaRef,
    draft,
    canSubmit,
    replyTo,
    onCancelReply,
    mentionsEnabled,
    mentionMenu,
    emojiOpen,
    onEmojiOpenChange,
    onValueChange,
    onSubmit,
    insertAtCaret,
    insertMentionTrigger,
    onPickFiles,
}: ItemChatComposerFooterProps) {
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    return (
        <DrawerFooter
            // In the hub pane, match the assistant page's composer inset.
            className={variant === 'pane' ? 'p-3' : undefined}
        >
            {replyTo ? (
                <ChatReplyQuote
                    author={replyTo.user?.name}
                    body={storedBodyToDraft(
                        replyTo.body,
                        replyTo.mentioned_users,
                    )}
                    action={
                        <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={onCancelReply}
                        >
                            {t('common.cancel')}
                        </Button>
                    }
                />
            ) : null}
            <ChatMentionMenu
                {...mentionMenu}
                open={mentionMenu.isOpen}
                renderHit={(hit) => <ChatMentionHitLabel hit={hit} />}
                textareaRef={textareaRef}
            >
                <ChatComposer
                    textareaRef={textareaRef}
                    value={draft}
                    onValueChange={onValueChange}
                    onSubmit={onSubmit}
                    canSubmit={canSubmit}
                    placeholder={t('collections.itemChat.placeholder')}
                    label={t('collections.itemChat.placeholder')}
                    sendLabel={t('collections.itemChat.send')}
                    textareaTestId="item-chat-composer"
                    submitTestId="item-chat-send"
                    onKeyDown={(event) => {
                        if (
                            mentionsEnabled &&
                            handleMentionMenuKeyDown(event, mentionMenu)
                        ) {
                            return;
                        }

                        if (event.key === ' ' && event.shiftKey) {
                            event.preventDefault();
                            insertAtCaret('\n');
                        }
                    }}
                    actions={
                        <>
                            {mentionsEnabled ? (
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    aria-label={t(
                                        'collections.itemChat.mention',
                                    )}
                                    onClick={insertMentionTrigger}
                                >
                                    @
                                </Button>
                            ) : null}
                            <Popover
                                open={emojiOpen}
                                onOpenChange={onEmojiOpenChange}
                            >
                                <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        aria-label={t(
                                            'collections.itemChat.emoji',
                                        )}
                                    >
                                        <Smile className="size-4" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                    className="w-64 p-2"
                                    align="start"
                                >
                                    <ChatEmojiGrid
                                        emojis={EMOJI_GRID}
                                        onSelect={(emoji) => {
                                            insertAtCaret(emoji);
                                            onEmojiOpenChange(false);
                                        }}
                                    />
                                </PopoverContent>
                            </Popover>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label={t('collections.itemChat.attach')}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Paperclip className="size-4" />
                            </Button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                multiple
                                onChange={(event) => {
                                    onPickFiles(event.target.files);
                                    event.target.value = '';
                                }}
                            />
                        </>
                    }
                />
            </ChatMentionMenu>
        </DrawerFooter>
    );
}

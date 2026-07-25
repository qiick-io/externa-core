import { Paperclip, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { AiFileCards } from '@/components/ai/ai-file-cards';
import type { AiFileCardItem } from '@/components/ai/ai-file-cards';
import { AssistantMarkdown } from '@/components/ai/assistant-markdown';
import { AssistantMessageActions } from '@/components/ai/assistant-message-actions';
import { ThinkingDots } from '@/components/ai/thinking-dots';
import { UserMessageActions } from '@/components/ai/user-message-actions';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import {
    Message,
    MessageContent,
    MessageFooter,
} from '@/components/ui/message';
import type { AiChatAttachment } from '@/lib/ai-chat';
import { suggestedActionsForTools } from '@/lib/ai-suggested-actions';
import { cn } from '@/lib/utils';

export type AiChatMessageView = {
    id: string;
    role: string;
    content: string;
    isError?: boolean;
    attachments?: AiChatAttachment[];
    fileCards?: AiFileCardItem[];
    toolNames?: string[];
    tool_calls?: Array<{ name?: string; function?: { name?: string } }>;
};

type AiChatMessagesProps = {
    messages: AiChatMessageView[];
    isStreaming: boolean;
    actionsDisabled?: boolean;
    emptyState?: ReactNode;
    editingMessageId: string | null;
    editingDraft: string;
    onEditingDraftChange: (value: string) => void;
    onCancelEdit: () => void;
    onStartEdit: (message: AiChatMessageView) => void;
    onResendEdited: (messageId: string) => void;
    onRegenerate: (
        assistantMessageId: string,
        options?: { asRetry?: boolean },
    ) => void;
    onSuggestedAction?: (prompt: string) => void;
};

/**
 * Shared AI chat message list (bubbles + action toolbar) for page and FAB drawer.
 */
export function AiChatMessages({
    messages,
    isStreaming,
    actionsDisabled = false,
    emptyState,
    editingMessageId,
    editingDraft,
    onEditingDraftChange,
    onCancelEdit,
    onStartEdit,
    onResendEdited,
    onRegenerate,
    onSuggestedAction,
}: AiChatMessagesProps) {
    if (messages.length === 0) {
        return <>{emptyState}</>;
    }

    return (
        <>
            {messages.map((message) => {
                const isUser = message.role === 'user';
                const isEditing = editingMessageId === message.id;
                const isEmptyAssistant =
                    !isUser && message.content.trim() === '';
                const isLastMessage =
                    message.id === messages[messages.length - 1]?.id;
                const showThinking =
                    isEmptyAssistant &&
                    isStreaming &&
                    isLastMessage &&
                    !message.isError;
                const actionsLocked = actionsDisabled || isStreaming;

                return (
                    <Message
                        key={message.id}
                        align={isUser ? 'end' : 'start'}
                    >
                        <MessageContent>
                            <Bubble
                                variant={
                                    message.isError
                                        ? 'destructive'
                                        : isUser
                                          ? 'muted'
                                          : 'ghost'
                                }
                                align={isUser ? 'end' : 'start'}
                            >
                                <BubbleContent
                                    className={cn(
                                        isUser
                                            ? 'text-foreground'
                                            : 'w-full max-w-full',
                                        isUser && !isEditing
                                            ? 'whitespace-pre-wrap'
                                            : null,
                                        !isUser && !message.isError
                                            ? 'whitespace-pre-wrap'
                                            : null,
                                    )}
                                >
                                    {isEditing ? (
                                        <div className="flex min-w-[16rem] flex-col gap-2">
                                            <textarea
                                                value={editingDraft}
                                                onChange={(event) =>
                                                    onEditingDraftChange(
                                                        event.target.value,
                                                    )
                                                }
                                                rows={3}
                                                className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            />
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={onCancelEdit}
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={() =>
                                                        onResendEdited(
                                                            message.id,
                                                        )
                                                    }
                                                >
                                                    Send again
                                                </Button>
                                            </div>
                                        </div>
                                    ) : showThinking ? (
                                        <ThinkingDots />
                                    ) : isUser ? (
                                        <div className="flex flex-col gap-2">
                                            {(message.attachments?.length ??
                                                0) > 0 ? (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {message.attachments?.map(
                                                        (attachment) => (
                                                            <span
                                                                key={
                                                                    attachment.id ??
                                                                    attachment.name
                                                                }
                                                                className="inline-flex items-center gap-1 rounded-md bg-foreground/15 px-2 py-0.5 text-xs"
                                                            >
                                                                <Paperclip className="size-3" />
                                                                {
                                                                    attachment.name
                                                                }
                                                            </span>
                                                        ),
                                                    )}
                                                </div>
                                            ) : null}
                                            <div className="whitespace-pre-wrap">
                                                {message.content}
                                            </div>
                                        </div>
                                    ) : message.isError ? (
                                        <div className="flex flex-col gap-2">
                                            <div className="text-sm whitespace-pre-wrap">
                                                {message.content}
                                            </div>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="secondary"
                                                className="w-fit"
                                                disabled={actionsLocked}
                                                onClick={() =>
                                                    onRegenerate(message.id, {
                                                        asRetry: true,
                                                    })
                                                }
                                            >
                                                <RefreshCw className="size-3.5" />
                                                Riprova
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-3">
                                            <AssistantMarkdown
                                                content={message.content}
                                            />
                                            {message.fileCards &&
                                            message.fileCards.length > 0 ? (
                                                <AiFileCards
                                                    files={message.fileCards}
                                                />
                                            ) : null}
                                            {isLastMessage &&
                                            onSuggestedAction
                                                ? (() => {
                                                      const toolNames =
                                                          message.toolNames ??
                                                          message.tool_calls
                                                              ?.map(
                                                                  (toolCall) =>
                                                                      toolCall.name ??
                                                                      toolCall
                                                                          .function
                                                                          ?.name,
                                                              )
                                                              .filter(
                                                                  (
                                                                      name,
                                                                  ): name is string =>
                                                                      Boolean(
                                                                          name,
                                                                      ),
                                                              ) ??
                                                          [];
                                                      const actions =
                                                          suggestedActionsForTools(
                                                              toolNames,
                                                          );

                                                      return actions.length >
                                                          0 ? (
                                                          <div className="flex flex-wrap gap-2">
                                                              {actions.map(
                                                                  (action) => (
                                                                      <Button
                                                                          key={
                                                                              action.label
                                                                          }
                                                                          type="button"
                                                                          size="sm"
                                                                          variant="outline"
                                                                          className="h-7 rounded-full text-xs"
                                                                          onClick={() =>
                                                                              onSuggestedAction(
                                                                                  action.prompt,
                                                                              )
                                                                          }
                                                                      >
                                                                          {
                                                                              action.label
                                                                          }
                                                                      </Button>
                                                                  ),
                                                              )}
                                                          </div>
                                                      ) : null;
                                                  })()
                                                : null}
                                        </div>
                                    )}
                                </BubbleContent>
                            </Bubble>

                            {isUser && !isEditing ? (
                                <MessageFooter className="opacity-60 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100">
                                    <UserMessageActions
                                        content={message.content}
                                        disabled={actionsLocked}
                                        onEdit={() => onStartEdit(message)}
                                    />
                                </MessageFooter>
                            ) : null}

                            {!isUser &&
                            !isEmptyAssistant &&
                            !message.isError ? (
                                <MessageFooter className="opacity-60 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100">
                                    <AssistantMessageActions
                                        content={message.content}
                                        disabled={actionsLocked}
                                        onRegenerate={() =>
                                            onRegenerate(message.id)
                                        }
                                    />
                                </MessageFooter>
                            ) : null}
                        </MessageContent>
                    </Message>
                );
            })}
        </>
    );
}

import {
    Check,
    Copy,
    FileDown,
    Paperclip,
    Pencil,
    RefreshCw,
    Volume2,
} from 'lucide-react';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    AiAnswerParts,
    AiAnswerSources,
    AiAnswerUsage,
} from '@/components/ai/ai-answer-parts';
import type { AiAnswerTextRenderer } from '@/components/ai/ai-answer-parts';
import { AiFileCards } from '@/components/ai/ai-file-cards';
import type { AiFileCardItem } from '@/components/ai/ai-file-cards';
import {
    Confirmation,
    ConfirmationAction,
    ConfirmationActions,
    ConfirmationTitle,
} from '@/components/ai-elements/confirmation';
import {
    MessageAction,
    MessageActions,
} from '@/components/ai-elements/message';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import {
    Tool,
    ToolContent,
    ToolHeader,
    ToolInput,
} from '@/components/ai-elements/tool';
import {
    Attachment,
    AttachmentContent,
    AttachmentGroup,
    AttachmentMedia,
    AttachmentTitle,
} from '@/components/ui/attachment';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import {
    Message,
    MessageContent,
    MessageFooter,
    MessageHeader,
} from '@/components/ui/message';
import { MessageScrollerItem } from '@/components/ui/message-scroller';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useAiAvailability } from '@/hooks/use-ai-availability';
import type { AiChatAttachment, AiPendingApproval } from '@/lib/ai-chat';
import { exportTextAsPdf, speakText } from '@/lib/ai-chat';
import type { AiMessagePart, AiSource, AiUsage } from '@/lib/ai-message-parts';
import { suggestedActionsForTools } from '@/lib/ai-suggested-actions';
import { copyTextToClipboard } from '@/lib/clipboard';
import { announce } from '@/lib/live-announcer';
import { toast } from '@/lib/toast';

export type AiChatMessageView = {
    id: string;
    role: string;
    content: string;
    isError?: boolean;
    attachments?: AiChatAttachment[];
    fileCards?: AiFileCardItem[];
    toolNames?: string[];
    tool_calls?: Array<{ name?: string; function?: { name?: string } }>;
    pending_approvals?: AiPendingApproval[];
    parts?: AiMessagePart[];
    sources?: AiSource[];
    usage?: AiUsage | null;
    model?: string | null;
};

type AiChatMessagesProps = {
    messages: AiChatMessageView[];
    isStreaming: boolean;
    actionsDisabled?: boolean;
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
    onResolveApprovals?: (messageId: string, approved: boolean) => void;
};

const COPY_FEEDBACK_MS = 2000;

/** Streamdown and shiki load with the first answer, not with every page. */
const MessageResponse = lazy(() =>
    import('@/components/ai-elements/message-response').then((module) => ({
        default: module.MessageResponse,
    })),
);

/**
 * Shared AI chat message list for the Assistant page and panel, on shadcn
 * `message` / `bubble` slots and AI Elements parts (presentation only:
 * Externa streams its own SSE). Render it inside `ChatMessageScroller`: every
 * message is a scroller item, and the user's prompts are scroll anchors (a new
 * prompt scrolls to the top while the answer streams below it).
 */
export function AiChatMessages({
    messages,
    isStreaming,
    actionsDisabled = false,
    editingMessageId,
    editingDraft,
    onEditingDraftChange,
    onCancelEdit,
    onStartEdit,
    onResendEdited,
    onRegenerate,
    onSuggestedAction,
    onResolveApprovals,
}: AiChatMessagesProps) {
    const { t } = useTranslation();
    const wasStreamingRef = useRef(false);
    const announcedMessageIdRef = useRef<string | null>(null);

    useEffect(() => {
        const wasStreaming = wasStreamingRef.current;
        wasStreamingRef.current = isStreaming;

        if (!wasStreaming || isStreaming) {
            return;
        }

        const lastAssistant = [...messages]
            .reverse()
            .find(
                (message) =>
                    message.role !== 'user' &&
                    message.content.trim() !== '' &&
                    !message.isError,
            );

        if (
            !lastAssistant ||
            announcedMessageIdRef.current === lastAssistant.id
        ) {
            return;
        }

        announcedMessageIdRef.current = lastAssistant.id;
        const preview = lastAssistant.content.trim().slice(0, 160);
        announce(
            t('a11y.aiAnswerReady', {
                preview:
                    preview.length < lastAssistant.content.trim().length
                        ? `${preview}…`
                        : preview,
            }),
            { politeness: 'polite' },
        );
    }, [isStreaming, messages, t]);

    if (messages.length === 0) {
        return null;
    }

    const actionsLocked = actionsDisabled || isStreaming;

    return (
        <>
            {messages.map((message, index) => {
                const isUser = message.role === 'user';
                const isLastMessage = index === messages.length - 1;

                return (
                    // Index keys keep the DOM rows when a reload swaps local ids for
                    // server ids, so the scroller does not treat them as new prompts.
                    <MessageScrollerItem
                        key={index}
                        messageId={message.id}
                        scrollAnchor={isUser}
                    >
                        {isUser ? (
                            <UserMessage
                                message={message}
                                isEditing={editingMessageId === message.id}
                                editingDraft={editingDraft}
                                actionsLocked={actionsLocked}
                                onEditingDraftChange={onEditingDraftChange}
                                onCancelEdit={onCancelEdit}
                                onStartEdit={() => onStartEdit(message)}
                                onResendEdited={() =>
                                    onResendEdited(message.id)
                                }
                            />
                        ) : (
                            <AssistantMessage
                                message={message}
                                isLastMessage={isLastMessage}
                                isStreaming={isStreaming && isLastMessage}
                                actionsLocked={actionsLocked}
                                onRegenerate={(options) =>
                                    onRegenerate(message.id, options)
                                }
                                onSuggestedAction={onSuggestedAction}
                                onResolveApprovals={
                                    onResolveApprovals
                                        ? (approved) =>
                                              onResolveApprovals(
                                                  message.id,
                                                  approved,
                                              )
                                        : undefined
                                }
                            />
                        )}
                    </MessageScrollerItem>
                );
            })}
        </>
    );
}

/** Copy with a check mark for two seconds; a toast only when copying fails. */
function CopyAction({
    content,
    disabled,
}: {
    content: string;
    disabled: boolean;
}) {
    const { t } = useTranslation();
    const [isCopied, setIsCopied] = useState(false);
    const resetTimerRef = useRef<number | null>(null);

    useEffect(
        () => () => {
            if (resetTimerRef.current !== null) {
                window.clearTimeout(resetTimerRef.current);
            }
        },
        [],
    );

    const handleCopy = async (): Promise<void> => {
        if (!(await copyTextToClipboard(content))) {
            toast.error(t('ai.copyFailed'));

            return;
        }

        setIsCopied(true);

        if (resetTimerRef.current !== null) {
            window.clearTimeout(resetTimerRef.current);
        }

        resetTimerRef.current = window.setTimeout(
            () => setIsCopied(false),
            COPY_FEEDBACK_MS,
        );
    };

    return (
        <MessageAction
            tooltip={isCopied ? t('ai.actions.copied') : t('ai.actions.copy')}
            className="text-muted-foreground"
            disabled={disabled || content.trim() === ''}
            onClick={() => void handleCopy()}
        >
            {isCopied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </MessageAction>
    );
}

function UserMessage({
    message,
    isEditing,
    editingDraft,
    actionsLocked,
    onEditingDraftChange,
    onCancelEdit,
    onStartEdit,
    onResendEdited,
}: {
    message: AiChatMessageView;
    isEditing: boolean;
    editingDraft: string;
    actionsLocked: boolean;
    onEditingDraftChange: (value: string) => void;
    onCancelEdit: () => void;
    onStartEdit: () => void;
    onResendEdited: () => void;
}) {
    const { t } = useTranslation();
    const attachments = message.attachments ?? [];

    return (
        <Message align="end">
            <MessageContent>
                {attachments.length > 0 && !isEditing ? (
                    <MessageHeader>
                        <AttachmentGroup>
                            {attachments.map((attachment) => (
                                <Attachment
                                    key={attachment.id ?? attachment.name}
                                    size="xs"
                                >
                                    <AttachmentMedia>
                                        <Paperclip />
                                    </AttachmentMedia>
                                    <AttachmentContent>
                                        <AttachmentTitle>
                                            {attachment.name}
                                        </AttachmentTitle>
                                    </AttachmentContent>
                                </Attachment>
                            ))}
                        </AttachmentGroup>
                    </MessageHeader>
                ) : null}
                <Bubble variant="muted" align="end">
                    <BubbleContent className="text-foreground">
                        {isEditing ? (
                            <div className="flex min-w-[16rem] flex-col gap-2">
                                <Textarea
                                    value={editingDraft}
                                    rows={3}
                                    aria-label={t('ai.messageAria')}
                                    className="bg-background"
                                    onChange={(event) =>
                                        onEditingDraftChange(event.target.value)
                                    }
                                />
                                <div className="flex justify-end gap-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={onCancelEdit}
                                    >
                                        {t('common.cancel')}
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={onResendEdited}
                                    >
                                        {t('ai.sendAgain')}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="whitespace-pre-wrap">
                                {message.content}
                            </div>
                        )}
                    </BubbleContent>
                </Bubble>
                {!isEditing ? (
                    <MessageFooter className="opacity-60 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100">
                        <MessageActions>
                            <MessageAction
                                tooltip={t('ai.actions.edit')}
                                className="text-muted-foreground"
                                disabled={actionsLocked}
                                onClick={onStartEdit}
                            >
                                <Pencil aria-hidden />
                            </MessageAction>
                            <CopyAction
                                content={message.content}
                                disabled={actionsLocked}
                            />
                        </MessageActions>
                    </MessageFooter>
                ) : null}
            </MessageContent>
        </Message>
    );
}

function AssistantMessage({
    message,
    isLastMessage,
    isStreaming,
    actionsLocked,
    onRegenerate,
    onSuggestedAction,
    onResolveApprovals,
}: {
    message: AiChatMessageView;
    isLastMessage: boolean;
    /** This message is the answer being streamed. */
    isStreaming: boolean;
    actionsLocked: boolean;
    onRegenerate: (options?: { asRetry?: boolean }) => void;
    onSuggestedAction?: (prompt: string) => void;
    onResolveApprovals?: (approved: boolean) => void;
}) {
    const { t } = useTranslation();
    const isEmpty = message.content.trim() === '';
    const hasParts = (message.parts?.length ?? 0) > 0;

    if (isEmpty && !hasParts && isStreaming && !message.isError) {
        return (
            <Message align="start">
                <Marker role="status">
                    <MarkerIcon>
                        <Spinner />
                    </MarkerIcon>
                    <MarkerContent>
                        <Shimmer>{t('ai.thinking')}</Shimmer>
                    </MarkerContent>
                </Marker>
            </Message>
        );
    }

    if (message.isError) {
        return (
            <Message align="start">
                <MessageContent>
                    <Bubble variant="destructive" align="start">
                        <BubbleContent className="w-full max-w-full">
                            <div className="flex flex-col gap-2">
                                <div className="text-sm whitespace-pre-wrap">
                                    {message.content}
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="w-fit"
                                    disabled={actionsLocked}
                                    onClick={() =>
                                        onRegenerate({ asRetry: true })
                                    }
                                >
                                    <RefreshCw className="size-3.5" />
                                    {t('ai.retry')}
                                </Button>
                            </div>
                        </BubbleContent>
                    </Bubble>
                </MessageContent>
            </Message>
        );
    }

    const pendingApprovals = message.pending_approvals ?? [];
    const showApprovals = Boolean(
        onResolveApprovals && isLastMessage && pendingApprovals.length > 0,
    );
    const toolNames =
        message.toolNames ??
        message.tool_calls
            ?.map((toolCall) => toolCall.name ?? toolCall.function?.name)
            .filter((name): name is string => Boolean(name)) ??
        [];
    const suggestions =
        isLastMessage && onSuggestedAction
            ? suggestedActionsForTools(toolNames)
            : [];

    return (
        <Message align="start">
            <MessageContent>
                <Bubble variant="ghost" align="start">
                    <BubbleContent className="flex w-full max-w-full flex-col gap-3">
                        <AiAnswerParts
                            parts={message.parts ?? []}
                            content={message.content}
                            isStreaming={isStreaming}
                            hidePendingApprovals={showApprovals}
                            renderText={renderAnswerText}
                        />
                        <AiAnswerSources sources={message.sources ?? []} />
                        {message.fileCards && message.fileCards.length > 0 ? (
                            <AiFileCards files={message.fileCards} />
                        ) : null}
                        {showApprovals && onResolveApprovals ? (
                            <ToolApprovals
                                approvals={pendingApprovals}
                                disabled={actionsLocked}
                                onResolve={onResolveApprovals}
                            />
                        ) : null}
                        {suggestions.length > 0 && onSuggestedAction ? (
                            <Suggestions>
                                {suggestions.map((action) => (
                                    <Suggestion
                                        key={action.id}
                                        suggestion={action.prompt}
                                        onClick={onSuggestedAction}
                                    >
                                        {t(`ai.suggestedActions.${action.id}`, {
                                            defaultValue: action.label,
                                        })}
                                    </Suggestion>
                                ))}
                            </Suggestions>
                        ) : null}
                    </BubbleContent>
                </Bubble>
                {!isEmpty ? (
                    <MessageFooter className="opacity-60 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100">
                        <AssistantActions
                            content={message.content}
                            disabled={actionsLocked}
                            onRegenerate={() => onRegenerate()}
                        />
                        <AssistantUsage usage={message.usage} />
                    </MessageFooter>
                ) : null}
            </MessageContent>
        </Message>
    );
}

/**
 * Markdown for an answer's text and reasoning parts (Streamdown, loaded
 * lazily): animated while that text still streams, static otherwise. The
 * plain text shows until the renderer has loaded.
 */
const renderAnswerText: AiAnswerTextRenderer = (text, { isLive }) => (
    <Suspense fallback={<div className="whitespace-pre-wrap">{text}</div>}>
        <MessageResponse
            mode={isLive ? 'streaming' : 'static'}
            isAnimating={isLive}
        >
            {text}
        </MessageResponse>
    </Suspense>
);

/** Token usage of the turn against the provider's context window. */
function AssistantUsage({ usage }: { usage: AiUsage | null | undefined }) {
    const { status } = useAiAvailability();

    return (
        <AiAnswerUsage
            usage={usage}
            maxTokens={status.context_window ?? null}
        />
    );
}

function AssistantActions({
    content,
    disabled,
    onRegenerate,
}: {
    content: string;
    disabled: boolean;
    onRegenerate: () => void;
}) {
    const { t } = useTranslation();

    const handleSpeak = (): void => {
        try {
            speakText(content);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : t('ai.speechUnavailable'),
            );
        }
    };

    const handleExportPdf = (): void => {
        try {
            exportTextAsPdf(t('ai.assistantMessagePdfTitle'), content);
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : t('ai.pdfFailed'),
            );
        }
    };

    return (
        <MessageActions className="gap-0.5">
            <CopyAction content={content} disabled={disabled} />
            <MessageAction
                tooltip={t('ai.regenerate')}
                className="text-muted-foreground"
                disabled={disabled}
                onClick={onRegenerate}
            >
                <RefreshCw aria-hidden />
            </MessageAction>
            <MessageAction
                tooltip={t('ai.exportPdf')}
                className="text-muted-foreground"
                disabled={disabled}
                onClick={handleExportPdf}
            >
                <FileDown aria-hidden />
            </MessageAction>
            <MessageAction
                tooltip={t('ai.readAloud')}
                className="text-muted-foreground"
                disabled={disabled}
                onClick={handleSpeak}
            >
                <Volume2 aria-hidden />
            </MessageAction>
        </MessageActions>
    );
}

/**
 * A turn paused for tool approval: each pending call as an AI Elements Tool
 * with its arguments in a code block, then one Confirmation for all of them
 * (the server resumes them together).
 */
function ToolApprovals({
    approvals,
    disabled,
    onResolve,
}: {
    approvals: AiPendingApproval[];
    disabled: boolean;
    onResolve: (approved: boolean) => void;
}) {
    const { t } = useTranslation();
    const reasons = approvals
        .map((approval) => approval.reason)
        .filter((reason): reason is string => Boolean(reason));

    return (
        <div className="flex flex-col gap-2 whitespace-normal">
            {approvals.map((approval) => (
                <Tool key={approval.id} defaultOpen className="mb-0">
                    <ToolHeader
                        type={`tool-${approval.tool}`}
                        title={approval.tool}
                        state="approval-requested"
                    />
                    <ToolContent>
                        <ToolInput input={approval.arguments ?? {}} />
                    </ToolContent>
                </Tool>
            ))}
            <Confirmation
                approval={{ id: approvals[0]?.id ?? '' }}
                state="approval-requested"
            >
                <ConfirmationTitle>
                    {reasons.length > 0
                        ? reasons.join(' ')
                        : t('ai.approval.request', {
                              tools: [
                                  ...new Set(
                                      approvals.map(
                                          (approval) => approval.tool,
                                      ),
                                  ),
                              ].join(', '),
                          })}
                </ConfirmationTitle>
                <ConfirmationActions>
                    <ConfirmationAction
                        variant="outline"
                        disabled={disabled}
                        onClick={() => onResolve(false)}
                    >
                        {t('ai.approval.reject')}
                    </ConfirmationAction>
                    <ConfirmationAction
                        variant="destructive"
                        disabled={disabled}
                        onClick={() => onResolve(true)}
                    >
                        {t('ai.approval.approve')}
                    </ConfirmationAction>
                </ConfirmationActions>
            </Confirmation>
        </div>
    );
}

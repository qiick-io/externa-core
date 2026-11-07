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
import { AiFileCards } from '@/components/ai/ai-file-cards';
import type { AiFileCardItem } from '@/components/ai/ai-file-cards';
import {
    ChainOfThought,
    ChainOfThoughtContent,
    ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';
import {
    Confirmation,
    ConfirmationAction,
    ConfirmationActions,
    ConfirmationTitle,
} from '@/components/ai-elements/confirmation';
import {
    Context,
    ContextCacheUsage,
    ContextContent,
    ContextContentBody,
    ContextContentHeader,
    ContextInputUsage,
    ContextOutputUsage,
    ContextReasoningUsage,
    ContextTrigger,
} from '@/components/ai-elements/context';
import {
    MessageAction,
    MessageActions,
} from '@/components/ai-elements/message';
import {
    Reasoning,
    ReasoningContent,
    ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import { Shimmer } from '@/components/ai-elements/shimmer';
import {
    Source,
    Sources,
    SourcesContent,
    SourcesTrigger,
} from '@/components/ai-elements/sources';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import {
    Tool,
    ToolContent,
    ToolHeader,
    ToolInput,
    ToolOutput,
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
import type {
    AiMessagePart,
    AiProviderToolPart,
    AiSource,
    AiToolPart,
    AiUsage,
} from '@/lib/ai-message-parts';
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
                        <AssistantParts
                            message={message}
                            isStreaming={isStreaming}
                            hidePendingApprovals={showApprovals}
                        />
                        {message.sources && message.sources.length > 0 ? (
                            <Sources>
                                <SourcesTrigger
                                    count={message.sources.length}
                                />
                                <SourcesContent>
                                    {message.sources.map((source) => (
                                        <Source
                                            key={source.url}
                                            href={source.url}
                                            title={source.title ?? source.url}
                                        />
                                    ))}
                                </SourcesContent>
                            </Sources>
                        ) : null}
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
                                        key={action.label}
                                        suggestion={action.prompt}
                                        onClick={onSuggestedAction}
                                    >
                                        {action.label}
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
 * The answer's parts in the order the model produced them: reasoning
 * (collapsed), tool calls (one Tool, or a ChainOfThought when the model took
 * several tool steps in a row) and text. Falls back to the plain content when a
 * turn has no text part (tool-only turns, older messages).
 */
function AssistantParts({
    message,
    isStreaming,
    hidePendingApprovals,
}: {
    message: AiChatMessageView;
    isStreaming: boolean;
    /** The approval block renders the paused calls itself. */
    hidePendingApprovals: boolean;
}) {
    const { t } = useTranslation();
    const parts = (message.parts ?? []).filter(
        (part) =>
            !(
                hidePendingApprovals &&
                part.type === 'tool' &&
                part.state === 'approval-requested'
            ),
    );

    if (
        !parts.some((part) => part.type === 'text') &&
        message.content.trim() !== ''
    ) {
        parts.push({ type: 'text', text: message.content });
    }

    const lastTextIndex = parts.findLastIndex((part) => part.type === 'text');
    const blocks: Array<
        | { kind: 'single'; part: AiMessagePart; index: number }
        | {
              kind: 'tools';
              parts: Array<AiToolPart | AiProviderToolPart>;
              index: number;
          }
    > = [];

    parts.forEach((part, index) => {
        const isToolPart =
            part.type === 'tool' || part.type === 'provider-tool';
        const previous = blocks.at(-1);

        if (isToolPart && previous?.kind === 'tools') {
            previous.parts.push(part);
        } else if (isToolPart) {
            blocks.push({ kind: 'tools', parts: [part], index });
        } else {
            blocks.push({ kind: 'single', part, index });
        }
    });

    return (
        <>
            {blocks.map((block) => {
                if (block.kind === 'tools') {
                    if (block.parts.length === 1) {
                        return (
                            <ToolPartView
                                key={block.index}
                                part={block.parts[0]!}
                            />
                        );
                    }

                    const isRunning =
                        isStreaming &&
                        block.parts.some(
                            (part) =>
                                part.type === 'tool' &&
                                part.state === 'input-available',
                        );

                    return (
                        <ChainOfThought key={block.index}>
                            <ChainOfThoughtHeader>
                                {isRunning ? (
                                    <Shimmer>
                                        {t('ai.tool.steps', {
                                            count: block.parts.length,
                                        })}
                                    </Shimmer>
                                ) : (
                                    t('ai.tool.steps', {
                                        count: block.parts.length,
                                    })
                                )}
                            </ChainOfThoughtHeader>
                            <ChainOfThoughtContent>
                                {block.parts.map((part) => (
                                    <ToolPartView key={part.id} part={part} />
                                ))}
                            </ChainOfThoughtContent>
                        </ChainOfThought>
                    );
                }

                const { part, index } = block;

                if (part.type === 'reasoning') {
                    return (
                        <Reasoning
                            key={index}
                            isStreaming={isStreaming && part.isStreaming}
                            duration={part.durationSeconds ?? undefined}
                        >
                            <ReasoningTrigger />
                            <ReasoningContent>
                                <Suspense
                                    fallback={
                                        <div className="whitespace-pre-wrap">
                                            {part.text}
                                        </div>
                                    }
                                >
                                    <MessageResponse mode="static">
                                        {part.text}
                                    </MessageResponse>
                                </Suspense>
                            </ReasoningContent>
                        </Reasoning>
                    );
                }

                if (part.type === 'text') {
                    const isLive = isStreaming && index === lastTextIndex;

                    return (
                        <Suspense
                            key={index}
                            fallback={
                                <div className="whitespace-pre-wrap">
                                    {part.text}
                                </div>
                            }
                        >
                            <MessageResponse
                                mode={isLive ? 'streaming' : 'static'}
                                isAnimating={isLive}
                            >
                                {part.text}
                            </MessageResponse>
                        </Suspense>
                    );
                }

                return null;
            })}
        </>
    );
}

/** One tool call (or provider tool) as an AI Elements Tool with its input and output. */
function ToolPartView({ part }: { part: AiToolPart | AiProviderToolPart }) {
    if (part.type === 'provider-tool') {
        return (
            <Tool className="mb-0">
                <ToolHeader
                    type={`tool-${part.kind}`}
                    title={part.kind}
                    state="output-available"
                />
                <ToolContent>
                    <ToolInput input={part.data} />
                </ToolContent>
            </Tool>
        );
    }

    return (
        <Tool className="mb-0" data-test="ai-tool-part">
            <ToolHeader
                type={`tool-${part.name}`}
                title={part.name}
                state={part.state}
            />
            <ToolContent>
                <ToolInput input={part.input} />
                <ToolOutput
                    output={part.output}
                    errorText={part.errorText ?? undefined}
                />
            </ToolContent>
        </Tool>
    );
}

/** Token usage of the turn against the model's context window (AI Elements Context). */
function AssistantUsage({ usage }: { usage: AiUsage | null | undefined }) {
    const { status } = useAiAvailability();
    const maxTokens = status.context_window ?? null;
    const usedTokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);

    if (!usage || !maxTokens || usedTokens === 0) {
        return null;
    }

    return (
        <Context usedTokens={usedTokens} maxTokens={maxTokens} usage={usage}>
            <ContextTrigger size="sm" className="text-xs" />
            <ContextContent align="start">
                <ContextContentHeader />
                <ContextContentBody>
                    <ContextInputUsage />
                    <ContextOutputUsage />
                    <ContextReasoningUsage />
                    <ContextCacheUsage />
                </ContextContentBody>
            </ContextContent>
        </Context>
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

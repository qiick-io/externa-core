import { ArrowLeft, Sparkles } from 'lucide-react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { AiChatDropZone } from '@/components/ai/ai-chat-drop-zone';
import { AiChatMessages } from '@/components/ai/ai-chat-messages';
import { AiComposer } from '@/components/ai/ai-composer';
import { AiDailyUsage } from '@/components/ai/ai-daily-usage';
import { AiImportJobMarker } from '@/components/ai/ai-run-status';
import { ChatMessageScroller } from '@/components/chat/chat-message-scroller';
import { Button } from '@/components/ui/button';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
} from '@/components/ui/empty';
import type { useAiChat } from '@/hooks/use-ai-chat';
import {
    AI_CHAT_ATTACHMENT_ACCEPT,
    AI_CHAT_ATTACHMENT_MAX_COUNT,
} from '@/lib/ai-chat';
import type { AiImportJobStatus } from '@/lib/ai-chat';

type AiConversationThreadProps = {
    chat: ReturnType<typeof useAiChat>;
    title: string | null;
    importJobStatus: AiImportJobStatus | null;
    /** Hidden upload input, also opened by the context attach dialog. */
    fileInputRef: RefObject<HTMLInputElement | null>;
    onBack: () => void;
    onOpenContextAttach: () => void;
    onOpenPresets: () => void;
};

/**
 * Open conversation of the AI hub: the mobile back header, the file drop
 * zone, the message scroller with the import job marker, the composer and
 * the daily usage line (#727).
 * @param {AiConversationThreadProps} props - Component props.
 * @returns {JSX.Element}
 */
export function AiConversationThread({
    chat,
    title,
    importJobStatus,
    fileInputRef,
    onBack,
    onOpenContextAttach,
    onOpenPresets,
}: AiConversationThreadProps) {
    const { t } = useTranslation();

    return (
        <>
            <div
                data-test="ai-thread-header"
                className="flex h-12 shrink-0 items-center gap-2 border-b px-2 md:hidden"
            >
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    data-test="ai-thread-back"
                    aria-label={t('ai.backToList')}
                    onClick={onBack}
                >
                    <ArrowLeft />
                </Button>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {title ?? t('ai.newChat')}
                </span>
            </div>
            <AiChatDropZone
                disabled={chat.isStreaming || chat.isUploadingAttachment}
                onFilesSelected={(files) =>
                    void chat.handleAttachmentFiles(files)
                }
            >
                <ChatMessageScroller
                    empty={
                        chat.messages.length === 0 ? (
                            <Empty data-test="ai-pane-empty" className="m-auto">
                                <EmptyHeader>
                                    <EmptyMedia
                                        variant="icon"
                                        className="bg-ai/10 text-ai"
                                    >
                                        <Sparkles />
                                    </EmptyMedia>
                                    <EmptyDescription>
                                        {t('ai.paneEmpty')}
                                    </EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        ) : null
                    }
                    autoScroll={!chat.isStreaming}
                    label={t('ai.conversationRegion')}
                    contentClassName="px-4 py-4"
                    // AiChatMessages announces finished answers itself.
                    contentProps={{ 'aria-live': 'off' }}
                >
                    <AiChatMessages
                        messages={chat.messages}
                        isStreaming={chat.isStreaming}
                        editingMessageId={chat.editingMessageId}
                        editingDraft={chat.editingDraft}
                        onEditingDraftChange={chat.setEditingDraft}
                        onCancelEdit={chat.cancelEditing}
                        onStartEdit={chat.startEditing}
                        onResendEdited={(messageId) =>
                            void chat.handleResendEdited(messageId)
                        }
                        onRegenerate={(messageId, options) =>
                            void chat.handleRegenerate(messageId, options)
                        }
                        onSuggestedAction={chat.setComposer}
                        onResolveApprovals={(messageId, approved) =>
                            void chat.handleResolveApprovals(
                                messageId,
                                approved,
                            )
                        }
                    />
                    <AiImportJobMarker status={importJobStatus} />
                </ChatMessageScroller>

                <div className="border-t p-3">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={AI_CHAT_ATTACHMENT_ACCEPT}
                        multiple
                        className="hidden"
                        onChange={(event) =>
                            void chat.handleAttachmentSelected(event)
                        }
                    />
                    <AiComposer
                        value={chat.composer}
                        onChange={chat.setComposer}
                        onSubmit={() => void chat.handleSend()}
                        onStop={chat.handleStop}
                        isStreaming={chat.isStreaming}
                        attachments={chat.pendingAttachments}
                        onRemoveAttachment={chat.removePendingAttachment}
                        contextAttachments={chat.pendingContextAttachments}
                        onRemoveContextAttachment={
                            chat.removePendingContextAttachment
                        }
                        onAttach={onOpenContextAttach}
                        isUploadingAttachment={chat.isUploadingAttachment}
                        attachDisabled={
                            chat.pendingAttachments.length >=
                            AI_CHAT_ATTACHMENT_MAX_COUNT
                        }
                        speechSupported={chat.speechSupported}
                        isListening={chat.isListening}
                        onToggleVoice={chat.toggleVoiceInput}
                        dryRunMode={chat.dryRunMode}
                        onDryRunModeChange={chat.setDryRunMode}
                        onOpenPresets={onOpenPresets}
                    />
                    <AiDailyUsage className="mt-2" />
                </div>
            </AiChatDropZone>
        </>
    );
}

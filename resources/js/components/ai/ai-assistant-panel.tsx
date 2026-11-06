import { router, usePage } from '@inertiajs/react';
import { Maximize2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { AiActionPresetsDrawer } from '@/components/ai/ai-action-presets-drawer';
import { AiChatDropZone } from '@/components/ai/ai-chat-drop-zone';
import { AiChatMessages } from '@/components/ai/ai-chat-messages';
import { AiComposer } from '@/components/ai/ai-composer';
import { AiContextAttachDialog } from '@/components/ai/ai-context-attach-dialog';
import {
    Drawer,
    DrawerBody,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { useAiAvailability } from '@/hooks/use-ai-availability';
import { useAiChat } from '@/hooks/use-ai-chat';
import {
    AI_CHAT_ATTACHMENT_ACCEPT,
    AI_CHAT_ATTACHMENT_MAX_COUNT,
} from '@/lib/ai-chat';
import { AI_OPEN_EVENT, AI_TOGGLE_EVENT } from '@/lib/ai-open';
import type { AiOpenDetail } from '@/lib/ai-open';
import { index as aiIndex, show as aiShow } from '@/routes/ai';

/**
 * AI assistant side panel available on every page except `/ai`. It opens from
 * the sidebar Assistant item, ⌘J / Ctrl+J and the contextual Ask AI buttons,
 * without leaving the current route; the header links to the full page.
 * @returns {JSX.Element | null}
 */
export function AiAssistantPanel() {
    const { t } = useTranslation();
    const page = usePage();
    // One shared /ai/status probe for the panel and every Ask AI button.
    const { canUseAi, isAvailable: isAiAvailable } = useAiAvailability();
    const isAiRoute =
        page.url === '/ai' ||
        page.url.startsWith('/ai/') ||
        page.url.startsWith('/ai?');

    const [open, setOpen] = useState(false);
    const [presetsOpen, setPresetsOpen] = useState(false);
    const [contextAttachOpen, setContextAttachOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const offline = !isAiAvailable;
    const chat = useAiChat({ isOffline: offline });
    const { startNewDraft } = chat;

    useEffect(() => {
        if (!canUseAi || isAiRoute) {
            return;
        }

        const onOpen = (event: Event): void => {
            const custom = event as CustomEvent<AiOpenDetail>;
            const prompt = custom.detail?.prompt;

            if (typeof prompt !== 'string') {
                return;
            }

            // Seed a fresh draft chat so contextual prompts don't append to an old thread.
            startNewDraft(prompt);
            setOpen(true);
        };

        const onToggle = (): void => setOpen((current) => !current);
        const onKeyDown = (event: KeyboardEvent): void => {
            if (
                (event.metaKey || event.ctrlKey) &&
                !event.altKey &&
                !event.shiftKey &&
                event.key.toLowerCase() === 'j'
            ) {
                event.preventDefault();
                onToggle();
            }
        };

        window.addEventListener(AI_OPEN_EVENT, onOpen);
        window.addEventListener(AI_TOGGLE_EVENT, onToggle);
        window.addEventListener('keydown', onKeyDown);

        return () => {
            window.removeEventListener(AI_OPEN_EVENT, onOpen);
            window.removeEventListener(AI_TOGGLE_EVENT, onToggle);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [canUseAi, isAiRoute, startNewDraft]);

    if (!canUseAi || isAiRoute) {
        return null;
    }

    return (
        <>
            <Drawer open={open} onOpenChange={setOpen} direction="right">
                <DrawerContent
                    onOpenAutoFocus={(event) => {
                        // Land in the composer (⌘J then type), never on the header button;
                        // offline (composer disabled) focus stays on the panel itself.
                        const panel = event.currentTarget;

                        if (!(panel instanceof HTMLElement)) {
                            return;
                        }

                        event.preventDefault();
                        (
                            panel.querySelector<HTMLElement>(
                                'textarea:not([disabled])',
                            ) ?? panel
                        ).focus();
                    }}
                >
                    <DrawerHeader className="flex-row items-start justify-between gap-2">
                        <div className="grid gap-1">
                            <DrawerTitle>{t('ai.fabTitle')}</DrawerTitle>
                            <DrawerDescription>
                                {t('ai.fabDescription')}
                            </DrawerDescription>
                        </div>
                        <HeaderIconButton
                            type="button"
                            variant="ghost"
                            label={t('ai.openFullPage')}
                            data-testid="ai-panel-full-page"
                            onClick={() => {
                                setOpen(false);
                                router.visit(
                                    chat.conversationId
                                        ? aiShow.url(chat.conversationId)
                                        : aiIndex.url(),
                                );
                            }}
                        >
                            <Maximize2 className="size-4" />
                        </HeaderIconButton>
                    </DrawerHeader>

                    <AiChatDropZone
                        disabled={
                            offline ||
                            chat.isStreaming ||
                            chat.isUploadingAttachment
                        }
                        onFilesSelected={(files) =>
                            void chat.handleAttachmentFiles(files)
                        }
                    >
                        <DrawerBody className="gap-3">
                            <AiChatMessages
                                messages={chat.messages}
                                isStreaming={chat.isStreaming}
                                actionsDisabled={offline}
                                editingMessageId={chat.editingMessageId}
                                editingDraft={chat.editingDraft}
                                onEditingDraftChange={chat.setEditingDraft}
                                onCancelEdit={chat.cancelEditing}
                                onStartEdit={chat.startEditing}
                                onResendEdited={(messageId) =>
                                    void chat.handleResendEdited(messageId)
                                }
                                onRegenerate={(messageId, options) =>
                                    void chat.handleRegenerate(
                                        messageId,
                                        options,
                                    )
                                }
                                onSuggestedAction={chat.setComposer}
                                onResolveApprovals={(messageId, approved) =>
                                    void chat.handleResolveApprovals(
                                        messageId,
                                        approved,
                                    )
                                }
                                emptyState={
                                    <p className="text-sm text-muted-foreground">
                                        {t('ai.fabEmpty')}
                                    </p>
                                }
                            />
                            {chat.toolHint ? (
                                <p className="text-xs text-muted-foreground">
                                    {chat.toolHint}
                                </p>
                            ) : null}
                        </DrawerBody>

                        <DrawerFooter className="gap-2">
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
                                disabled={offline}
                                placeholder={
                                    offline
                                        ? t('ai.offlinePlaceholder')
                                        : t('ai.askSomething')
                                }
                                attachments={chat.pendingAttachments}
                                onRemoveAttachment={
                                    chat.removePendingAttachment
                                }
                                contextAttachments={
                                    chat.pendingContextAttachments
                                }
                                onRemoveContextAttachment={
                                    chat.removePendingContextAttachment
                                }
                                onAttach={() => setContextAttachOpen(true)}
                                isUploadingAttachment={
                                    chat.isUploadingAttachment
                                }
                                attachDisabled={
                                    chat.pendingAttachments.length >=
                                    AI_CHAT_ATTACHMENT_MAX_COUNT
                                }
                                speechSupported={chat.speechSupported}
                                isListening={chat.isListening}
                                onToggleVoice={chat.toggleVoiceInput}
                                onOpenPresets={() => setPresetsOpen(true)}
                                attachTooltip={t('ai.attachTooltip')}
                            />
                        </DrawerFooter>
                    </AiChatDropZone>
                </DrawerContent>
            </Drawer>

            <AiContextAttachDialog
                open={contextAttachOpen}
                onOpenChange={setContextAttachOpen}
                onAttach={chat.addContextAttachments}
                onPickUploadFiles={() => {
                    setContextAttachOpen(false);
                    fileInputRef.current?.click();
                }}
            />

            <AiActionPresetsDrawer
                nested
                open={presetsOpen}
                onOpenChange={setPresetsOpen}
                onSelect={(prompt) => chat.setComposer(prompt)}
            />
        </>
    );
}

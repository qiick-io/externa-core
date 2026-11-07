import {
    File as FileIcon,
    FlaskConical,
    LayoutList,
    Library,
    Mic,
    MicOff,
    Paperclip,
    Sparkles,
    X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatComposer } from '@/components/chat/chat-composer';
import {
    Attachment,
    AttachmentAction,
    AttachmentActions,
    AttachmentContent,
    AttachmentGroup,
    AttachmentMedia,
    AttachmentTitle,
} from '@/components/ui/attachment';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import type { AiChatAttachment } from '@/lib/ai-chat';
import type { AiPendingContextAttachment } from '@/lib/ai-context';
import { cn } from '@/lib/utils';

type AiComposerProps = {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onStop?: () => void;
    isStreaming?: boolean;
    disabled?: boolean;
    placeholder?: string;
    attachments?: AiChatAttachment[];
    onRemoveAttachment?: (attachmentId: string) => void;
    contextAttachments?: AiPendingContextAttachment[];
    onRemoveContextAttachment?: (
        kind: AiPendingContextAttachment['kind'],
        id: number,
    ) => void;
    onAttach?: () => void;
    isUploadingAttachment?: boolean;
    attachDisabled?: boolean;
    speechSupported?: boolean;
    isListening?: boolean;
    onToggleVoice?: () => void;
    dryRunMode?: boolean;
    onDryRunModeChange?: (enabled: boolean) => void;
    onOpenPresets?: () => void;
    className?: string;
    attachTooltip?: string;
};

/**
 * Chat input with attachments, voice, and preset actions.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function AiComposer({
    value,
    onChange,
    onSubmit,
    onStop,
    isStreaming = false,
    disabled = false,
    placeholder,
    attachments = [],
    onRemoveAttachment,
    contextAttachments = [],
    onRemoveContextAttachment,
    onAttach,
    isUploadingAttachment = false,
    attachDisabled = false,
    speechSupported = false,
    isListening = false,
    onToggleVoice,
    dryRunMode = false,
    onDryRunModeChange,
    onOpenPresets,
    className,
    attachTooltip,
}: AiComposerProps) {
    const { t } = useTranslation();
    const resolvedPlaceholder = placeholder ?? t('ai.askPlaceholder');
    const resolvedAttachTooltip = attachTooltip ?? t('ai.attachShortTooltip');
    const canSubmit = !isUploadingAttachment && value.trim() !== '';
    const hasChips = attachments.length > 0 || contextAttachments.length > 0;

    return (
        <ChatComposer
            className={className}
            value={value}
            onValueChange={(nextValue) => onChange(nextValue)}
            onSubmit={onSubmit}
            canSubmit={canSubmit}
            isStreaming={isStreaming}
            onStop={onStop}
            disabled={disabled}
            placeholder={resolvedPlaceholder}
            label={t('ai.messageAria')}
            sendLabel={t('ai.sendAria')}
            stopLabel={t('ai.stopAria')}
            header={
                hasChips ? (
                    <AttachmentGroup>
                        {contextAttachments.map((attachment) => (
                            <ComposerChip
                                key={`${attachment.kind}-${attachment.id}`}
                                name={attachment.name}
                                icon={
                                    attachment.kind === 'item' ? (
                                        <Library />
                                    ) : attachment.kind === 'file' ? (
                                        <FileIcon />
                                    ) : (
                                        <Sparkles />
                                    )
                                }
                                removeDisabled={isStreaming || disabled}
                                onRemove={
                                    onRemoveContextAttachment
                                        ? () =>
                                              onRemoveContextAttachment(
                                                  attachment.kind,
                                                  attachment.id,
                                              )
                                        : undefined
                                }
                            />
                        ))}
                        {attachments.map((attachment) => (
                            <ComposerChip
                                key={attachment.id}
                                name={attachment.name}
                                icon={<Paperclip />}
                                removeDisabled={isStreaming || disabled}
                                onRemove={
                                    onRemoveAttachment
                                        ? () =>
                                              onRemoveAttachment(attachment.id)
                                        : undefined
                                }
                            />
                        ))}
                    </AttachmentGroup>
                ) : null
            }
            actions={
                <>
                    {onOpenPresets ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="text-muted-foreground"
                                    disabled={disabled || isStreaming}
                                    onClick={onOpenPresets}
                                    aria-label={t('ai.usefulActionsAria')}
                                >
                                    <LayoutList className="size-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t('ai.usefulActionsAria')}
                            </TooltipContent>
                        </Tooltip>
                    ) : null}
                    {onAttach ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="text-muted-foreground"
                                    disabled={
                                        disabled ||
                                        isStreaming ||
                                        isUploadingAttachment ||
                                        attachDisabled
                                    }
                                    onClick={onAttach}
                                    aria-label={t('ai.attachAria')}
                                >
                                    <Paperclip className="size-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {resolvedAttachTooltip}
                            </TooltipContent>
                        </Tooltip>
                    ) : null}
                    {onDryRunModeChange ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant={dryRunMode ? 'secondary' : 'ghost'}
                                    className="gap-1.5 px-2"
                                    disabled={disabled || isStreaming}
                                    onClick={() =>
                                        onDryRunModeChange(!dryRunMode)
                                    }
                                    aria-pressed={dryRunMode}
                                >
                                    <FlaskConical className="size-3.5" />
                                    {t('ai.simulation')}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t('ai.simulationHint')}
                            </TooltipContent>
                        </Tooltip>
                    ) : null}
                </>
            }
            trailingActions={
                onToggleVoice ? (
                    speechSupported ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className={cn(
                                        'text-muted-foreground',
                                        isListening &&
                                            'bg-primary/10 text-primary',
                                    )}
                                    disabled={disabled || isStreaming}
                                    onClick={onToggleVoice}
                                    aria-label={t('ai.dictationAria')}
                                    aria-pressed={isListening}
                                >
                                    {isListening ? (
                                        <MicOff
                                            className="size-4"
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        <Mic
                                            className="size-4"
                                            aria-hidden="true"
                                        />
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {isListening
                                    ? t('ai.stopDictation')
                                    : t('ai.voiceDictation')}
                            </TooltipContent>
                        </Tooltip>
                    ) : (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="inline-flex items-center">
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="text-muted-foreground"
                                        disabled
                                        aria-label={t('ai.dictationAria')}
                                    >
                                        <Mic className="size-4" />
                                    </Button>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t('ai.dictationUnsupported')}
                            </TooltipContent>
                        </Tooltip>
                    )
                ) : null
            }
        />
    );
}

/** One pending attachment or context entry above the composer textarea. */
function ComposerChip({
    name,
    icon,
    removeDisabled,
    onRemove,
}: {
    name: string;
    icon: ReactNode;
    removeDisabled: boolean;
    onRemove?: () => void;
}) {
    const { t } = useTranslation();

    return (
        <Attachment size="xs" className="min-w-0">
            <AttachmentMedia>{icon}</AttachmentMedia>
            <AttachmentContent className="max-w-48">
                <AttachmentTitle>{name}</AttachmentTitle>
            </AttachmentContent>
            {onRemove ? (
                <AttachmentActions>
                    <AttachmentAction
                        aria-label={t('ai.removeAttachment', { name })}
                        disabled={removeDisabled}
                        onClick={onRemove}
                    >
                        <X />
                    </AttachmentAction>
                </AttachmentActions>
            ) : null}
        </Attachment>
    );
}

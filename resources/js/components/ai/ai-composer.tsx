import {
    ArrowUp,
    FlaskConical,
    LayoutList,
    Mic,
    MicOff,
    Paperclip,
    Square,
    X,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { FormEvent, KeyboardEvent, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import type { AiChatAttachment } from '@/lib/ai-chat';
import { cn } from '@/lib/utils';

const MIN_TEXTAREA_HEIGHT_PX = 40;
const MAX_TEXTAREA_HEIGHT_PX = 168; // ~7 rows at text-sm

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
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        const textarea = textareaRef.current;

        if (!textarea) {
            return;
        }

        textarea.style.height = '0px';
        const nextHeight = Math.min(
            Math.max(textarea.scrollHeight, MIN_TEXTAREA_HEIGHT_PX),
            MAX_TEXTAREA_HEIGHT_PX,
        );
        textarea.style.height = `${nextHeight}px`;
        textarea.style.overflowY =
            textarea.scrollHeight > MAX_TEXTAREA_HEIGHT_PX ? 'auto' : 'hidden';
    }, [value]);

    const canSubmit =
        !disabled &&
        !isStreaming &&
        !isUploadingAttachment &&
        value.trim() !== '';

    const handleFormSubmit = (event: FormEvent) => {
        event.preventDefault();

        // Never send while streaming — Stop must not fall through to submit.
        if (isStreaming || !canSubmit) {
            return;
        }

        onSubmit();
    };

    const handleStopClick = (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onStop?.();
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (
            event.key !== 'Enter' ||
            event.shiftKey ||
            event.nativeEvent.isComposing
        ) {
            return;
        }

        event.preventDefault();

        if (isStreaming || !canSubmit) {
            return;
        }

        onSubmit();
    };

    return (
        <form className={cn('w-full', className)} onSubmit={handleFormSubmit}>
            <div
                className={cn(
                    'rounded-2xl border border-border bg-background shadow-xs',
                    'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
                )}
            >
                {attachments.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                        {attachments.map((attachment) => (
                            <span
                                key={attachment.id}
                                className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs"
                            >
                                <Paperclip className="size-3" />
                                <span className="max-w-[12rem] truncate">
                                    {attachment.name}
                                </span>
                                {onRemoveAttachment ? (
                                    <button
                                        type="button"
                                        className="rounded-sm p-0.5 hover:bg-background"
                                        onClick={() =>
                                            onRemoveAttachment(attachment.id)
                                        }
                                        aria-label={t('ai.removeAttachment', {
                                            name: attachment.name,
                                        })}
                                        disabled={isStreaming || disabled}
                                    >
                                        <X className="size-3" />
                                    </button>
                                ) : null}
                            </span>
                        ))}
                    </div>
                ) : null}

                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={resolvedPlaceholder}
                    disabled={disabled || isStreaming}
                    rows={1}
                    className={cn(
                        'block w-full resize-none border-0 bg-transparent px-3 pt-3 pb-2',
                        'text-sm text-foreground outline-none placeholder:text-muted-foreground',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                    style={{
                        minHeight: MIN_TEXTAREA_HEIGHT_PX,
                        maxHeight: MAX_TEXTAREA_HEIGHT_PX,
                    }}
                    aria-label={t('ai.messageAria')}
                />

                <div className="flex items-center justify-between gap-2 px-2 pb-2">
                    <div className="flex items-center gap-1">
                        {onOpenPresets ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="size-8 text-muted-foreground"
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
                                        className="size-8 text-muted-foreground"
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
                                        size="sm"
                                        variant={
                                            dryRunMode ? 'secondary' : 'ghost'
                                        }
                                        className="h-8 gap-1.5 px-2 text-xs"
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
                    </div>

                    <div className="flex items-center gap-1">
                        {onToggleVoice ? (
                            speechSupported ? (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className={cn(
                                                'size-8 text-muted-foreground',
                                                isListening &&
                                                    'bg-primary/10 text-primary',
                                            )}
                                            disabled={disabled || isStreaming}
                                            onClick={onToggleVoice}
                                            aria-label={t('ai.dictationAria')}
                                        >
                                            {isListening ? (
                                                <MicOff className="size-4" />
                                            ) : (
                                                <Mic className="size-4" />
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
                                                className="size-8 text-muted-foreground"
                                                disabled
                                                aria-label={t(
                                                    'ai.dictationAria',
                                                )}
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
                        ) : null}

                        {isStreaming && onStop ? (
                            <Button
                                type="button"
                                size="icon"
                                variant="destructive"
                                className="relative z-10 size-8 rounded-full"
                                disabled={false}
                                onClick={handleStopClick}
                                aria-label={t('ai.stopAria')}
                            >
                                <Square className="size-3.5 fill-current" />
                            </Button>
                        ) : (
                            <Button
                                type="submit"
                                size="icon"
                                className="size-8 rounded-full"
                                disabled={!canSubmit || isStreaming}
                                aria-label={t('ai.sendAria')}
                            >
                                <ArrowUp className="size-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </form>
    );
}

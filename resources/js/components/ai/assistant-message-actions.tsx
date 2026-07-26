import { Copy, FileDown, RefreshCw, Volume2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { exportTextAsPdf, speakText } from '@/lib/ai-chat';
import { copyTextToClipboard } from '@/lib/clipboard';
import { toast } from '@/lib/toast';

type AssistantMessageActionsProps = {
    content: string;
    disabled?: boolean;
    onRegenerate?: () => void;
};

/**
 * Copy and feedback actions on assistant messages.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function AssistantMessageActions({
    content,
    disabled = false,
    onRegenerate,
}: AssistantMessageActionsProps) {
    const hasContent = content.trim() !== '';

    const handleCopy = async () => {
        const copied = await copyTextToClipboard(content);

        if (copied) {
            toast.success('Copied to clipboard');

            return;
        }

        toast.error('Copy failed');
    };

    const handleSpeak = () => {
        try {
            speakText(content);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Speech synthesis unavailable',
            );
        }
    };

    const handleExportPdf = () => {
        try {
            exportTextAsPdf('Assistant message', content);
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'PDF export failed',
            );
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-0.5">
            <ActionButton
                label="Copy"
                disabled={disabled || !hasContent}
                onClick={() => void handleCopy()}
            >
                <Copy className="size-3.5" />
            </ActionButton>
            <ActionButton
                label="Regenerate"
                disabled={disabled || !onRegenerate}
                onClick={() => onRegenerate?.()}
            >
                <RefreshCw className="size-3.5" />
            </ActionButton>
            <ActionButton
                label="Export PDF"
                disabled={disabled || !hasContent}
                onClick={handleExportPdf}
            >
                <FileDown className="size-3.5" />
            </ActionButton>
            <ActionButton
                label="Read aloud"
                disabled={disabled || !hasContent}
                onClick={handleSpeak}
            >
                <Volume2 className="size-3.5" />
            </ActionButton>
        </div>
    );
}

function ActionButton({
    label,
    disabled,
    onClick,
    children,
}: {
    label: string;
    disabled?: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground"
                    disabled={disabled}
                    onClick={onClick}
                    aria-label={label}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

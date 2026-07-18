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

export function AssistantMessageActions({
    content,
    disabled = false,
    onRegenerate,
}: AssistantMessageActionsProps) {
    const hasContent = content.trim() !== '';

    const handleCopy = async () => {
        const copied = await copyTextToClipboard(content);

        if (copied) {
            toast.success('Copiato negli appunti');

            return;
        }

        toast.error('Copia non riuscita');
    };

    const handleSpeak = () => {
        try {
            speakText(content);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Sintesi vocale non disponibile',
            );
        }
    };

    const handleExportPdf = () => {
        try {
            exportTextAsPdf('Messaggio assistente', content);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Esportazione PDF non riuscita',
            );
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-0.5">
            <ActionButton
                label="Copia"
                disabled={disabled || !hasContent}
                onClick={() => void handleCopy()}
            >
                <Copy className="size-3.5" />
            </ActionButton>
            <ActionButton
                label="Rigenera"
                disabled={disabled || !onRegenerate}
                onClick={() => onRegenerate?.()}
            >
                <RefreshCw className="size-3.5" />
            </ActionButton>
            <ActionButton
                label="Esporta PDF"
                disabled={disabled || !hasContent}
                onClick={handleExportPdf}
            >
                <FileDown className="size-3.5" />
            </ActionButton>
            <ActionButton
                label="Leggi ad alta voce"
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

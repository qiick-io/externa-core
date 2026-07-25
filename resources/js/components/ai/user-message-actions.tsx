import { Copy, Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { copyTextToClipboard } from '@/lib/clipboard';
import { toast } from '@/lib/toast';

type UserMessageActionsProps = {
    content: string;
    disabled?: boolean;
    onEdit: () => void;
};

/**
 * Edit and delete actions on user chat messages.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function UserMessageActions({
    content,
    disabled = false,
    onEdit,
}: UserMessageActionsProps) {
    const hasContent = content.trim() !== '';

    const handleCopy = async () => {
        const copied = await copyTextToClipboard(content);

        if (copied) {
            toast.success('Copied to clipboard');

            return;
        }

        toast.error('Copy failed');
    };

    return (
        <div className="flex flex-wrap items-center gap-0.5">
            <ActionButton
                label="Edit"
                disabled={disabled}
                onClick={onEdit}
            >
                <Pencil className="size-3.5" />
            </ActionButton>
            <ActionButton
                label="Copy"
                disabled={disabled || !hasContent}
                onClick={() => void handleCopy()}
            >
                <Copy className="size-3.5" />
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

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Action button for the rich-text toolbars (undo, redo, markdown commands):
 * outline icon Button with its label in a Tooltip.
 * @returns {JSX.Element}
 */
export function ToolbarButton({
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
                    variant="outline"
                    size="icon"
                    aria-label={label}
                    disabled={disabled}
                    onClick={onClick}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

/**
 * On/off format control for the WYSIWYG toolbar (bold, heading, list, ...):
 * outline `Toggle` whose pressed state mirrors the editor selection, label in
 * a Tooltip. Pressing runs the editor command; the editor state then drives
 * `pressed` on the next render.
 * @returns {JSX.Element}
 */
export function ToolbarToggle({
    label,
    pressed,
    onToggle,
    children,
}: {
    label: string;
    pressed: boolean;
    onToggle: () => void;
    children: ReactNode;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Toggle
                    variant="outline"
                    aria-label={label}
                    pressed={pressed}
                    onPressedChange={onToggle}
                >
                    {children}
                </Toggle>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/*
 * AI Elements `message` (registry.ai-sdk.dev), the parts Externa uses:
 * MessageActions and MessageAction (MessageResponse is in
 * `message-response.tsx`, loaded lazily so Streamdown stays out of the layout
 * chunk). The bubble and layout come from shadcn `message` / `bubble`.
 * Changes from the registry copy: MessageAction relies on the app-level
 * TooltipProvider; MessageResponse adds the shiki plugin and keeps
 * `rehype-sanitize` after Streamdown's own rehype plugins, and takes its
 * control labels from the app locale.
 */

export type MessageActionsProps = ComponentProps<'div'>;

export const MessageActions = ({
    className,
    children,
    ...props
}: MessageActionsProps) => (
    <div className={cn('flex items-center gap-1', className)} {...props}>
        {children}
    </div>
);

export type MessageActionProps = ComponentProps<typeof Button> & {
    tooltip?: string;
    label?: string;
};

export const MessageAction = ({
    tooltip,
    children,
    label,
    variant = 'ghost',
    size = 'icon-sm',
    ...props
}: MessageActionProps) => {
    const button = (
        <Button size={size} type="button" variant={variant} {...props}>
            {children}
            <span className="sr-only">{label || tooltip}</span>
        </Button>
    );

    if (tooltip) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent>
                    <p>{tooltip}</p>
                </TooltipContent>
            </Tooltip>
        );
    }

    return button;
};

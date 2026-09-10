import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Icon-only header/toolbar button with accessible tooltip label.
 */
export function HeaderIconButton({
    label,
    children,
    variant = 'ghost',
    size = 'icon',
    ref,
    ...props
}: ComponentProps<typeof Button> & { label: string }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    ref={ref}
                    variant={variant}
                    size={size}
                    aria-label={label}
                    {...props}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

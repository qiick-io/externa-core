import { Sparkles } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAiAvailability } from '@/hooks/use-ai-availability';
import { openAiWithPrompt } from '@/lib/ai-open';
import { cn } from '@/lib/utils';

type AskAiButtonProps = {
    /** Seeded composer prompt; ignored when `onAsk` is given. */
    prompt?: string;
    /** Custom handler (e.g. a bulk prompt built from the current selection). */
    onAsk?: () => void;
    /** Overrides the default "Ask AI" label. */
    label?: string;
    /** icon = compact table-row action (`icon-sm`, 24px); labeled = bulk toolbar (default 32px, #472) */
    mode?: 'icon' | 'labeled';
    className?: string;
    stopPropagation?: boolean;
};

/**
 * Opens the AI FAB with a seeded composer prompt (CanUseAi only; never auto-sends).
 *
 * Shares the FAB availability probe: while AI is offline the button stays
 * focusable but `aria-disabled`, ignores clicks and explains why in a tooltip
 * and an `aria-describedby` description.
 */
export function AskAiButton({
    prompt = '',
    onAsk,
    label,
    mode = 'icon',
    className,
    stopPropagation = false,
}: AskAiButtonProps) {
    const { t } = useTranslation();
    const { canUseAi, isAvailable, unavailableReason } = useAiAvailability();
    const reasonId = useId();

    if (!canUseAi) {
        return null;
    }

    const buttonLabel = label ?? t('ai.askAi');
    const handleClick = (event: MouseEvent): void => {
        if (stopPropagation) {
            event.stopPropagation();
        }

        if (!isAvailable) {
            event.preventDefault();

            return;
        }

        if (onAsk) {
            onAsk();

            return;
        }

        openAiWithPrompt(prompt);
    };
    const availabilityProps = isAvailable
        ? {}
        : {
              'aria-disabled': true,
              'aria-describedby': reasonId,
              'data-ai-unavailable': '',
          };
    const buttonClassName = cn(
        !isAvailable && 'cursor-not-allowed opacity-50',
        className,
    );

    const button =
        mode === 'labeled' ? (
            <Button
                type="button"
                variant="outline"
                className={buttonClassName}
                onClick={handleClick}
                {...availabilityProps}
            >
                <Sparkles className="size-4 text-ai" aria-hidden="true" />
                {buttonLabel}
            </Button>
        ) : (
            <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className={buttonClassName}
                aria-label={buttonLabel}
                onClick={handleClick}
                {...availabilityProps}
            >
                <Sparkles className="text-ai" aria-hidden="true" />
            </Button>
        );

    if (mode === 'labeled' && isAvailable) {
        return button;
    }

    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent>
                    {isAvailable ? buttonLabel : unavailableReason}
                </TooltipContent>
            </Tooltip>
            {isAvailable ? null : (
                <span id={reasonId} className="sr-only">
                    {unavailableReason}
                </span>
            )}
        </>
    );
}

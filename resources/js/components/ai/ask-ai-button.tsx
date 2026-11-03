import { Sparkles } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { openAiWithPrompt } from '@/lib/ai-open';

type AskAiButtonProps = {
    prompt: string;
    /** icon = compact table-row action (`icon-sm`, 24px); labeled = bulk toolbar (default 32px, #472) */
    mode?: 'icon' | 'labeled';
    className?: string;
    stopPropagation?: boolean;
};

/**
 * Opens the AI FAB with a seeded composer prompt (CanUseAi only; never auto-sends).
 */
export function AskAiButton({
    prompt,
    mode = 'icon',
    className,
    stopPropagation = false,
}: AskAiButtonProps) {
    const { t } = useTranslation();
    const { can } = useCan();

    if (!can(PermissionEnum.CanUseAi)) {
        return null;
    }

    const label = t('ai.askAi');
    const handleClick = (event: MouseEvent): void => {
        if (stopPropagation) {
            event.stopPropagation();
        }

        openAiWithPrompt(prompt);
    };

    if (mode === 'labeled') {
        return (
            <Button
                type="button"
                variant="outline"
                className={className}
                onClick={handleClick}
            >
                <Sparkles className="size-4 text-ai" aria-hidden="true" />
                {label}
            </Button>
        );
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className={className}
                    aria-label={label}
                    onClick={handleClick}
                >
                    <Sparkles className="text-ai" aria-hidden="true" />
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

import { useTranslation } from 'react-i18next';
import { useAiAvailability } from '@/hooks/use-ai-availability';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Today's AI usage against the daily prompt cap and token budget ("Today: 3 / 50 prompts ·
 * 12,000 / 100,000 tokens"). Renders nothing when neither limit is set (`daily_usage` null).
 *
 * @param props.className - Extra classes for spacing in the host layout
 */
export function AiDailyUsage({ className }: { className?: string }) {
    const { t } = useTranslation();
    const { status } = useAiAvailability();
    const dailyUsage = status.daily_usage;

    if (!dailyUsage) {
        return null;
    }

    const parts: string[] = [];

    if (dailyUsage.prompt_limit !== null) {
        parts.push(
            t('ai.dailyUsage.prompts', {
                used: formatNumber(dailyUsage.prompts_used),
                limit: formatNumber(dailyUsage.prompt_limit),
            }),
        );
    }

    if (dailyUsage.token_budget !== null) {
        parts.push(
            t('ai.dailyUsage.tokens', {
                used: formatNumber(dailyUsage.tokens_used),
                limit: formatNumber(dailyUsage.token_budget),
            }),
        );
    }

    return (
        <p
            className={cn('text-xs text-muted-foreground', className)}
            data-test="ai-daily-usage"
        >
            {t('ai.dailyUsage.label', { usage: parts.join(' · ') })}
        </p>
    );
}

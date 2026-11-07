import { createContext, useContext } from 'react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Progress } from '@/components/ui/progress';
import type { AiUsage } from '@/lib/ai-message-parts';
import { cn } from '@/lib/utils';

/*
 * AI Elements `context` (registry.ai-sdk.dev). Changes from the registry copy:
 * - the usage is Externa's laravel/ai usage object instead of ai-sdk's
 *   `LanguageModelUsage`, so the `ai` package is not needed;
 * - no cost lines: they need `tokenlens` model pricing, which is not installed;
 * - numbers follow the app locale and the labels go through i18n
 *   (`ai.usage.*`).
 */

const PERCENT_MAX = 100;
const ICON_RADIUS = 10;
const ICON_VIEWBOX = 24;
const ICON_CENTER = 12;
const ICON_STROKE_WIDTH = 2;

type ContextSchema = {
    usedTokens: number;
    maxTokens: number;
    usage?: AiUsage | null;
};

const ContextContext = createContext<ContextSchema | null>(null);

const useContextValue = () => {
    const context = useContext(ContextContext);

    if (!context) {
        throw new Error('Context components must be used within Context');
    }

    return context;
};

export type ContextProps = ComponentProps<typeof HoverCard> & ContextSchema;

export const Context = ({
    usedTokens,
    maxTokens,
    usage,
    ...props
}: ContextProps) => (
    <ContextContext.Provider value={{ usedTokens, maxTokens, usage }}>
        <HoverCard closeDelay={0} openDelay={0} {...props} />
    </ContextContext.Provider>
);

function usedFraction(usedTokens: number, maxTokens: number): number {
    return maxTokens > 0 ? Math.min(usedTokens / maxTokens, 1) : 0;
}

const ContextIcon = () => {
    const { usedTokens, maxTokens } = useContextValue();
    const circumference = 2 * Math.PI * ICON_RADIUS;
    const dashOffset =
        circumference * (1 - usedFraction(usedTokens, maxTokens));

    return (
        <svg
            aria-hidden
            height="20"
            style={{ color: 'currentcolor' }}
            viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
            width="20"
        >
            <circle
                cx={ICON_CENTER}
                cy={ICON_CENTER}
                fill="none"
                opacity="0.25"
                r={ICON_RADIUS}
                stroke="currentColor"
                strokeWidth={ICON_STROKE_WIDTH}
            />
            <circle
                cx={ICON_CENTER}
                cy={ICON_CENTER}
                fill="none"
                opacity="0.7"
                r={ICON_RADIUS}
                stroke="currentColor"
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                strokeWidth={ICON_STROKE_WIDTH}
                style={{
                    transformOrigin: 'center',
                    transform: 'rotate(-90deg)',
                }}
            />
        </svg>
    );
};

function usePercent(): string {
    const { i18n } = useTranslation();
    const { usedTokens, maxTokens } = useContextValue();

    return new Intl.NumberFormat(i18n.language, {
        style: 'percent',
        maximumFractionDigits: 1,
    }).format(usedFraction(usedTokens, maxTokens));
}

export type ContextTriggerProps = ComponentProps<typeof Button>;

export const ContextTrigger = ({ children, ...props }: ContextTriggerProps) => {
    const { t } = useTranslation();
    const percent = usePercent();

    return (
        <HoverCardTrigger asChild>
            {children ?? (
                <Button
                    type="button"
                    variant="ghost"
                    aria-label={t('ai.usage.trigger', { percent })}
                    {...props}
                >
                    <span className="font-medium text-muted-foreground">
                        {percent}
                    </span>
                    <ContextIcon />
                </Button>
            )}
        </HoverCardTrigger>
    );
};

export type ContextContentProps = ComponentProps<typeof HoverCardContent>;

export const ContextContent = ({
    className,
    ...props
}: ContextContentProps) => (
    <HoverCardContent
        className={cn('min-w-60 divide-y overflow-hidden p-0', className)}
        {...props}
    />
);

export type ContextContentHeaderProps = ComponentProps<'div'>;

export const ContextContentHeader = ({
    children,
    className,
    ...props
}: ContextContentHeaderProps) => {
    const { i18n } = useTranslation();
    const { usedTokens, maxTokens } = useContextValue();
    const percent = usePercent();
    const compact = new Intl.NumberFormat(i18n.language, {
        notation: 'compact',
    });

    return (
        <div className={cn('w-full space-y-2 p-3', className)} {...props}>
            {children ?? (
                <>
                    <div className="flex items-center justify-between gap-3 text-xs">
                        <p>{percent}</p>
                        <p className="font-mono text-muted-foreground">
                            {compact.format(usedTokens)} /{' '}
                            {compact.format(maxTokens)}
                        </p>
                    </div>
                    <Progress
                        className="bg-muted"
                        value={
                            usedFraction(usedTokens, maxTokens) * PERCENT_MAX
                        }
                    />
                </>
            )}
        </div>
    );
};

export type ContextContentBodyProps = ComponentProps<'div'>;

export const ContextContentBody = ({
    children,
    className,
    ...props
}: ContextContentBodyProps) => (
    <div className={cn('w-full space-y-1 p-3', className)} {...props}>
        {children}
    </div>
);

type UsageRowProps = ComponentProps<'div'> & {
    tokens: number | undefined;
    label: string;
};

const UsageRow = ({ tokens, label, className, ...props }: UsageRowProps) => {
    const { i18n } = useTranslation();

    if (!tokens) {
        return null;
    }

    return (
        <div
            className={cn(
                'flex items-center justify-between text-xs',
                className,
            )}
            {...props}
        >
            <span className="text-muted-foreground">{label}</span>
            <span>
                {new Intl.NumberFormat(i18n.language, {
                    notation: 'compact',
                }).format(tokens)}
            </span>
        </div>
    );
};

export const ContextInputUsage = (props: ComponentProps<'div'>) => {
    const { t } = useTranslation();
    const { usage } = useContextValue();

    return (
        <UsageRow
            tokens={usage?.input_tokens}
            label={t('ai.usage.input')}
            {...props}
        />
    );
};

export const ContextOutputUsage = (props: ComponentProps<'div'>) => {
    const { t } = useTranslation();
    const { usage } = useContextValue();

    return (
        <UsageRow
            tokens={usage?.output_tokens}
            label={t('ai.usage.output')}
            {...props}
        />
    );
};

export const ContextReasoningUsage = (props: ComponentProps<'div'>) => {
    const { t } = useTranslation();
    const { usage } = useContextValue();

    return (
        <UsageRow
            tokens={usage?.reasoning_tokens}
            label={t('ai.usage.reasoning')}
            {...props}
        />
    );
};

export const ContextCacheUsage = (props: ComponentProps<'div'>) => {
    const { t } = useTranslation();
    const { usage } = useContextValue();

    return (
        <UsageRow
            tokens={usage?.cache_read_input_tokens}
            label={t('ai.usage.cache')}
            {...props}
        />
    );
};

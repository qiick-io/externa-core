import { BrainIcon, ChevronDownIcon } from 'lucide-react';
import { createContext, memo, useContext } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { useOpenState } from '@/components/ai-elements/use-open-state';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

/*
 * AI Elements `reasoning` (registry.ai-sdk.dev). Changes from the registry copy:
 * - collapsed by default and no auto-open / auto-close (Luca, 2026-11-07:
 *   reasoning is shown to everyone, collapsed);
 * - the duration comes from the caller (measured while streaming, unknown on
 *   reload) instead of being timed inside the component;
 * - `ReasoningContent` takes any children, so the caller renders the text with
 *   the lazily loaded Streamdown response;
 * - the labels go through i18n (`ai.reasoning.*`).
 */

type ReasoningContextValue = {
    isStreaming: boolean;
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    duration: number | undefined;
};

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export const useReasoning = () => {
    const context = useContext(ReasoningContext);

    if (!context) {
        throw new Error('Reasoning components must be used within Reasoning');
    }

    return context;
};

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
    isStreaming?: boolean;
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    duration?: number;
};

export const Reasoning = memo(
    ({
        className,
        isStreaming = false,
        open,
        defaultOpen = false,
        onOpenChange,
        duration,
        children,
        ...props
    }: ReasoningProps) => {
        const [isOpen, setIsOpen] = useOpenState(
            open,
            defaultOpen,
            onOpenChange,
        );

        return (
            <ReasoningContext.Provider
                value={{ isStreaming, isOpen, setIsOpen, duration }}
            >
                <Collapsible
                    className={cn('not-prose', className)}
                    onOpenChange={setIsOpen}
                    open={isOpen}
                    {...props}
                >
                    {children}
                </Collapsible>
            </ReasoningContext.Provider>
        );
    },
);

export type ReasoningTriggerProps = ComponentProps<
    typeof CollapsibleTrigger
> & {
    getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

export const ReasoningTrigger = memo(
    ({
        className,
        children,
        getThinkingMessage,
        ...props
    }: ReasoningTriggerProps) => {
        const { t } = useTranslation();
        const { isStreaming, isOpen, duration } = useReasoning();
        const message = getThinkingMessage ? (
            getThinkingMessage(isStreaming, duration)
        ) : isStreaming || duration === 0 ? (
            <Shimmer>{t('ai.reasoning.thinking')}</Shimmer>
        ) : duration === undefined ? (
            t('ai.reasoning.thoughtFewSeconds')
        ) : (
            t('ai.reasoning.thoughtFor', { count: duration })
        );

        return (
            <CollapsibleTrigger
                className={cn(
                    'flex w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground',
                    className,
                )}
                {...props}
            >
                {children ?? (
                    <>
                        <BrainIcon className="size-4" />
                        <span>{message}</span>
                        <ChevronDownIcon
                            className={cn(
                                'size-4 transition-transform',
                                isOpen ? 'rotate-180' : 'rotate-0',
                            )}
                        />
                    </>
                )}
            </CollapsibleTrigger>
        );
    },
);

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent>;

export const ReasoningContent = memo(
    ({ className, children, ...props }: ReasoningContentProps) => (
        <CollapsibleContent
            className={cn(
                'mt-3 text-sm',
                'text-muted-foreground outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2',
                className,
            )}
            {...props}
        >
            {children}
        </CollapsibleContent>
    ),
);

Reasoning.displayName = 'Reasoning';
ReasoningTrigger.displayName = 'ReasoningTrigger';
ReasoningContent.displayName = 'ReasoningContent';

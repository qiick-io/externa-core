import { BrainIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
    TraceCollapsible,
    TraceCollapsibleContent,
    TraceCollapsibleTrigger,
    TraceIcon,
    TraceLine,
    TraceTitle,
} from '@/components/ui/trace';

/*
 * AI Elements `reasoning` as shadcn rebuilt it on Trace
 * (ui.shadcn.com/docs/ai-elements/base/reasoning): "Thinking…" shimmering while
 * the model reasons, then "Thought for N seconds", opening to the text.
 * Changes from upstream: collapsed by default with no auto-open while it
 * streams (Luca, 2026-11-07: reasoning is shown to everyone, collapsed); the
 * duration comes from the caller (measured while streaming, unknown on
 * reload); the labels go through i18n (`ai.reasoning.*`). Render it inside a
 * `Trace`.
 */

export type ReasoningProps = {
    isStreaming?: boolean;
    /** Whole seconds spent thinking; undefined when unknown (a reload). */
    duration?: number;
    defaultOpen?: boolean;
    /** The reasoning text, rendered by the caller (Markdown). */
    children?: ReactNode;
};

export const Reasoning = ({
    isStreaming = false,
    duration,
    defaultOpen = false,
    children,
}: ReasoningProps) => {
    const { t } = useTranslation();
    const title =
        isStreaming || duration === 0
            ? t('ai.reasoning.thinking')
            : duration === undefined
              ? t('ai.reasoning.thoughtFewSeconds')
              : t('ai.reasoning.thoughtFor', { count: duration });
    const line = (
        <TraceLine status={isStreaming ? 'running' : undefined}>
            <TraceIcon>
                <BrainIcon />
            </TraceIcon>
            <TraceTitle>{title}</TraceTitle>
        </TraceLine>
    );

    if (!children) {
        return line;
    }

    return (
        <TraceCollapsible defaultOpen={defaultOpen}>
            <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
            <TraceCollapsibleContent className="text-sm">
                {children}
            </TraceCollapsibleContent>
        </TraceCollapsible>
    );
};

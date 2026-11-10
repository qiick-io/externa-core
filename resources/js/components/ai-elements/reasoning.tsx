import { BrainIcon } from 'lucide-react';
import { useState } from 'react';
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
 * the model reasons, then "Thought for N seconds", opening to the text. As
 * upstream, it opens while it streams and closes when it finishes; once the
 * person opens or closes it, their choice wins. No height limit, as upstream.
 * Changes from upstream: the duration comes from the caller (measured while
 * streaming, unknown on reload); the labels go through i18n
 * (`ai.reasoning.*`). Render it inside a `Trace`.
 */

export type ReasoningProps = {
    isStreaming?: boolean;
    /** Whole seconds spent thinking; undefined when unknown (a reload). */
    duration?: number;
    /** Start open, as if the person had opened it. */
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
    // Undefined until the person opens or closes it: then it follows the stream.
    const [isOpenByPerson, setIsOpenByPerson] = useState<boolean | undefined>(
        defaultOpen ? true : undefined,
    );
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
        <TraceCollapsible
            open={isOpenByPerson ?? isStreaming}
            onOpenChange={setIsOpenByPerson}
        >
            <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
            <TraceCollapsibleContent className="text-sm">
                {children}
            </TraceCollapsibleContent>
        </TraceCollapsible>
    );
};

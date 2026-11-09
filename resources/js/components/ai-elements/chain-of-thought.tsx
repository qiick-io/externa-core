import { CircleCheckIcon, ListChecksIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
    Trace,
    TraceCollapsible,
    TraceCollapsibleContent,
    TraceCollapsibleTrigger,
    TraceIcon,
    TraceLine,
    TraceTitle,
} from '@/components/ui/trace';

/*
 * AI Elements `chain-of-thought` as shadcn rebuilt it on Trace
 * (ui.shadcn.com/docs/ai-elements/base/chain-of-thought): a summary line
 * ("Done in 3 steps") that opens to one line per step. The steps are the
 * children (`Tool` lines). Render it inside a `Trace`.
 */

export type ChainOfThoughtProps = {
    /** The summary sentence, such as "Done in 3 steps". */
    title: ReactNode;
    /** A step is still working: the summary shimmers. */
    isRunning?: boolean;
    defaultOpen?: boolean;
    children: ReactNode;
};

export const ChainOfThought = ({
    title,
    isRunning = false,
    defaultOpen = false,
    children,
}: ChainOfThoughtProps) => (
    <TraceCollapsible defaultOpen={defaultOpen}>
        <TraceCollapsibleTrigger>
            <TraceLine status={isRunning ? 'running' : undefined}>
                <TraceIcon>
                    {isRunning ? <ListChecksIcon /> : <CircleCheckIcon />}
                </TraceIcon>
                <TraceTitle>{title}</TraceTitle>
            </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
            <Trace>{children}</Trace>
        </TraceCollapsibleContent>
    </TraceCollapsible>
);

import {
    BanIcon,
    CircleCheckIcon,
    CircleXIcon,
    ClockIcon,
    WrenchIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
    TraceCollapsible,
    TraceCollapsibleContent,
    TraceCollapsibleTrigger,
    TraceDescription,
    TraceIcon,
    TraceLine,
    TraceTitle,
} from '@/components/ui/trace';

/*
 * AI Elements `tool` as shadcn rebuilt it on Trace
 * (ui.shadcn.com/docs/ai-elements/base/tool): one line with a sentence the app
 * writes for the call ("Listed the collections"), never the raw JSON of its
 * arguments or result, which mean nothing to the person reading the answer.
 * A failed call opens to its error message; every other call is a plain line.
 * Render it inside a `Trace`.
 */

/** The ai-sdk tool part states the line switches on. */
export type ToolState =
    | 'input-streaming'
    | 'input-available'
    | 'approval-requested'
    | 'approval-responded'
    | 'output-available'
    | 'output-error'
    | 'output-denied';

export type ToolProps = {
    /** The sentence for the call in its current state, written by the app. */
    title: ReactNode;
    state: ToolState;
    /** Secondary detail after the title, such as the name of the record. */
    description?: ReactNode;
    /** The error a failed call returned, shown when the line is opened. */
    errorText?: string | null;
    /**
     * A call left running when the turn ended (a stopped stream): shown as
     * waiting, not as working or failed.
     */
    isWaiting?: boolean;
};

/** Whether a call in this state is still working. */
export const isToolRunning = (state: ToolState): boolean =>
    state === 'input-streaming' ||
    state === 'input-available' ||
    state === 'approval-responded';

const iconForState = (state: ToolState): ReactNode => {
    if (isToolRunning(state)) {
        return <WrenchIcon />;
    }

    if (state === 'approval-requested') {
        return <ClockIcon />;
    }

    if (state === 'output-error') {
        return <CircleXIcon />;
    }

    if (state === 'output-denied') {
        return <BanIcon />;
    }

    return <CircleCheckIcon />;
};

export const Tool = ({
    title,
    state,
    description,
    errorText,
    isWaiting = false,
}: ToolProps) => {
    const isFailed = state === 'output-error';
    const isWorking = isToolRunning(state) && !isWaiting;
    const line = (
        <TraceLine
            status={isFailed ? 'error' : isWorking ? 'running' : undefined}
        >
            <TraceIcon>
                {isWaiting ? <ClockIcon /> : iconForState(state)}
            </TraceIcon>
            <TraceTitle>{title}</TraceTitle>
            {description ? (
                <TraceDescription>{description}</TraceDescription>
            ) : null}
        </TraceLine>
    );

    if (!isFailed || !errorText) {
        return line;
    }

    return (
        <TraceCollapsible>
            <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
            <TraceCollapsibleContent className="text-destructive">
                {errorText}
            </TraceCollapsibleContent>
        </TraceCollapsible>
    );
};

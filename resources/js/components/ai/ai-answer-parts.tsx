import type { TFunction } from 'i18next';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChainOfThought } from '@/components/ai-elements/chain-of-thought';
import {
    Context,
    ContextCacheUsage,
    ContextContent,
    ContextContentBody,
    ContextContentHeader,
    ContextInputUsage,
    ContextOutputUsage,
    ContextReasoningUsage,
    ContextTrigger,
} from '@/components/ai-elements/context';
import { Reasoning } from '@/components/ai-elements/reasoning';
import { Sources } from '@/components/ai-elements/sources';
import { isToolRunning, Tool } from '@/components/ai-elements/tool';
import type { ToolState } from '@/components/ai-elements/tool';
import { Trace } from '@/components/ui/trace';
import type {
    AiMessagePart,
    AiProviderToolPart,
    AiSource,
    AiToolPart,
    AiUsage,
} from '@/lib/ai-message-parts';

/** Renders a text (or reasoning) part; `isLive` while that text still streams. */
export type AiAnswerTextRenderer = (
    text: string,
    options: { isLive: boolean },
) => ReactNode;

/** One tool call as the describer sees it. */
export type AiToolCall = {
    name: string;
    input: unknown;
    state: ToolState;
};

/** The sentence a tool call shows, and an optional detail after it. */
export type AiToolCallDescription = {
    title: string;
    description?: string;
};

/**
 * Turns a tool call into the sentence its line shows ("Listed the
 * collections"). Apps pass one that knows their tools and actions; the
 * fallback names the tool generically.
 */
export type AiToolCallDescriber = (
    call: AiToolCall,
    t: TFunction,
) => AiToolCallDescription;

/** "ManageCollections" or "manage_collections" -> "Manage collections". */
export const humanizeToolName = (name: string): string => {
    const words = name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .trim()
        .toLowerCase();

    return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The generic sentence for a call: "Using / Used / Could not use <tool>". */
export const describeToolCallGenerically: AiToolCallDescriber = (call, t) => {
    const tool = humanizeToolName(call.name);

    if (isToolRunning(call.state)) {
        return { title: t('ai.tool.title.running', { tool }) };
    }

    if (call.state === 'approval-requested') {
        return { title: t('ai.tool.title.approval', { tool }) };
    }

    if (call.state === 'output-error') {
        return { title: t('ai.tool.title.error', { tool }) };
    }

    if (call.state === 'output-denied') {
        return { title: t('ai.tool.title.denied', { tool }) };
    }

    return { title: t('ai.tool.title.done', { tool }) };
};

/** Plain-text fallback; apps pass a Markdown renderer (Streamdown in externa-core). */
const renderPlainText: AiAnswerTextRenderer = (text) => (
    <div className="whitespace-pre-wrap">{text}</div>
);

type AiAnswerPartsProps = {
    parts: AiMessagePart[];
    /** The turn's plain content, shown as text when no text part exists (tool-only turns, older messages). */
    content?: string;
    isStreaming: boolean;
    /** Hide calls waiting for approval when an approval block renders them. */
    hidePendingApprovals?: boolean;
    renderText?: AiAnswerTextRenderer;
    /** The sentence of each tool call; defaults to the generic one. */
    describeToolCall?: AiToolCallDescriber;
};

/**
 * An AI answer's parts in the order the model produced them, on the AI
 * Elements shadcn rebuilt on Trace: reasoning (one line, collapsed), tool
 * calls (one line each, or a Chain of Thought "Done in N steps" when the
 * model took several in a row) and text. A tool line is a sentence from
 * `describeToolCall`, never the raw JSON of the call. The parts come from
 * `lib/ai-message-parts.ts`, live from the stream or rebuilt from the stored
 * steps. Extracted from externa-core's `AssistantParts`.
 */
export function AiAnswerParts({
    parts: allParts,
    content = '',
    isStreaming,
    hidePendingApprovals = false,
    renderText = renderPlainText,
    describeToolCall = describeToolCallGenerically,
}: AiAnswerPartsProps) {
    const { t } = useTranslation();
    const parts = allParts.filter(
        (part) =>
            !(
                hidePendingApprovals &&
                part.type === 'tool' &&
                part.state === 'approval-requested'
            ),
    );

    if (!parts.some((part) => part.type === 'text') && content.trim() !== '') {
        parts.push({ type: 'text', text: content });
    }

    const lastTextIndex = parts.findLastIndex((part) => part.type === 'text');
    const blocks: Array<
        | { kind: 'single'; part: AiMessagePart; index: number }
        | {
              kind: 'tools';
              parts: Array<AiToolPart | AiProviderToolPart>;
              index: number;
          }
    > = [];

    parts.forEach((part, index) => {
        const isToolPart =
            part.type === 'tool' || part.type === 'provider-tool';
        const previous = blocks.at(-1);

        if (isToolPart && previous?.kind === 'tools') {
            previous.parts.push(part);
        } else if (isToolPart) {
            blocks.push({ kind: 'tools', parts: [part], index });
        } else {
            blocks.push({ kind: 'single', part, index });
        }
    });

    return (
        <>
            {blocks.map((block) => {
                if (block.kind === 'tools') {
                    if (block.parts.length === 1) {
                        return (
                            <Trace key={block.index}>
                                <AiToolPartView
                                    part={block.parts[0]!}
                                    isStreaming={isStreaming}
                                    describeToolCall={describeToolCall}
                                />
                            </Trace>
                        );
                    }

                    const isRunning =
                        isStreaming &&
                        block.parts.some(
                            (part) =>
                                part.type === 'tool' &&
                                isToolRunning(part.state),
                        );

                    return (
                        <Trace key={block.index}>
                            <ChainOfThought
                                isRunning={isRunning}
                                title={t(
                                    isRunning
                                        ? 'ai.tool.stepsRunning'
                                        : 'ai.tool.steps',
                                    { count: block.parts.length },
                                )}
                            >
                                {block.parts.map((part) => (
                                    <AiToolPartView
                                        key={part.id}
                                        part={part}
                                        isStreaming={isStreaming}
                                        describeToolCall={describeToolCall}
                                    />
                                ))}
                            </ChainOfThought>
                        </Trace>
                    );
                }

                const { part, index } = block;

                if (part.type === 'reasoning') {
                    const isThinking = isStreaming && part.isStreaming;

                    return (
                        <Trace key={index}>
                            <Reasoning
                                isStreaming={isThinking}
                                duration={part.durationSeconds ?? undefined}
                            >
                                {part.text.trim() === ''
                                    ? null
                                    : renderText(part.text, { isLive: false })}
                            </Reasoning>
                        </Trace>
                    );
                }

                if (part.type === 'text') {
                    return (
                        <Fragment key={index}>
                            {renderText(part.text, {
                                isLive: isStreaming && index === lastTextIndex,
                            })}
                        </Fragment>
                    );
                }

                return null;
            })}
        </>
    );
}

/**
 * One tool call (or provider tool, e.g. web search) as a Trace `Tool` line.
 * A call the stream left running after the turn ended is shown as waiting,
 * not failed (shadcn's guidance).
 */
export function AiToolPartView({
    part,
    isStreaming = false,
    describeToolCall = describeToolCallGenerically,
}: {
    part: AiToolPart | AiProviderToolPart;
    isStreaming?: boolean;
    describeToolCall?: AiToolCallDescriber;
}) {
    const { t } = useTranslation();

    if (part.type === 'provider-tool') {
        const query = part.data.query;

        return (
            <Tool
                title={t(`ai.tool.provider.${part.kind}`, {
                    defaultValue: t('ai.tool.title.done', {
                        tool: humanizeToolName(part.kind),
                    }),
                })}
                description={typeof query === 'string' ? query : undefined}
                state="output-available"
            />
        );
    }

    const description = describeToolCall(
        { name: part.name, input: part.input, state: part.state },
        t,
    );

    return (
        <Tool
            title={description.title}
            description={description.description}
            state={part.state}
            errorText={part.errorText}
            isWaiting={!isStreaming && isToolRunning(part.state)}
        />
    );
}

/** The answer's citations as AI Elements `Sources` ("Used N sources", collapsed). */
export function AiAnswerSources({ sources }: { sources: AiSource[] }) {
    if (sources.length === 0) {
        return null;
    }

    return (
        <Trace>
            <Sources sources={sources} />
        </Trace>
    );
}

/**
 * The turn's token usage against the model's context window, as AI Elements
 * `Context`. Renders nothing without usage or a known window.
 */
export function AiAnswerUsage({
    usage,
    maxTokens,
}: {
    usage: AiUsage | null | undefined;
    /** The model's context window (the app knows it per provider). */
    maxTokens: number | null | undefined;
}) {
    const usedTokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);

    if (!usage || !maxTokens || usedTokens === 0) {
        return null;
    }

    return (
        <Context usedTokens={usedTokens} maxTokens={maxTokens} usage={usage}>
            <ContextTrigger size="sm" className="text-xs" />
            <ContextContent align="start">
                <ContextContentHeader />
                <ContextContentBody>
                    <ContextInputUsage />
                    <ContextOutputUsage />
                    <ContextReasoningUsage />
                    <ContextCacheUsage />
                </ContextContentBody>
            </ContextContent>
        </Context>
    );
}

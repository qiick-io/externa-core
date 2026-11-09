import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ChainOfThought,
    ChainOfThoughtContent,
    ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';
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
import {
    Reasoning,
    ReasoningContent,
    ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import { Shimmer } from '@/components/ai-elements/shimmer';
import {
    Source,
    Sources,
    SourcesContent,
    SourcesTrigger,
} from '@/components/ai-elements/sources';
import {
    Tool,
    ToolContent,
    ToolHeader,
    ToolInput,
    ToolOutput,
} from '@/components/ai-elements/tool';
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
};

/**
 * An AI answer's parts in the order the model produced them, on AI Elements:
 * reasoning (`Reasoning`, collapsed), tool calls (one `Tool`, or a
 * `ChainOfThought` when the model took several tool steps in a row, its title
 * shimmering while a step runs) and text. The parts come from
 * `lib/ai-message-parts.ts`, live from the stream or rebuilt from the stored
 * steps. Extracted from externa-core's `AssistantParts`.
 */
export function AiAnswerParts({
    parts: allParts,
    content = '',
    isStreaming,
    hidePendingApprovals = false,
    renderText = renderPlainText,
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
                            <AiToolPartView
                                key={block.index}
                                part={block.parts[0]!}
                            />
                        );
                    }

                    const isRunning =
                        isStreaming &&
                        block.parts.some(
                            (part) =>
                                part.type === 'tool' &&
                                part.state === 'input-available',
                        );
                    const title = t('ai.tool.steps', {
                        count: block.parts.length,
                    });

                    return (
                        <ChainOfThought key={block.index}>
                            <ChainOfThoughtHeader>
                                {isRunning ? <Shimmer>{title}</Shimmer> : title}
                            </ChainOfThoughtHeader>
                            <ChainOfThoughtContent>
                                {block.parts.map((part) => (
                                    <AiToolPartView key={part.id} part={part} />
                                ))}
                            </ChainOfThoughtContent>
                        </ChainOfThought>
                    );
                }

                const { part, index } = block;

                if (part.type === 'reasoning') {
                    return (
                        <Reasoning
                            key={index}
                            isStreaming={isStreaming && part.isStreaming}
                            duration={part.durationSeconds ?? undefined}
                        >
                            <ReasoningTrigger />
                            <ReasoningContent>
                                {renderText(part.text, { isLive: false })}
                            </ReasoningContent>
                        </Reasoning>
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

/** One tool call (or provider tool, e.g. web search) as an AI Elements `Tool` with its input and output. */
export function AiToolPartView({
    part,
}: {
    part: AiToolPart | AiProviderToolPart;
}) {
    if (part.type === 'provider-tool') {
        return (
            <Tool className="mb-0">
                <ToolHeader
                    type={`tool-${part.kind}`}
                    title={part.kind}
                    state="output-available"
                />
                <ToolContent>
                    <ToolInput input={part.data} />
                </ToolContent>
            </Tool>
        );
    }

    return (
        <Tool className="mb-0" data-test="ai-tool-part">
            <ToolHeader
                type={`tool-${part.name}`}
                title={part.name}
                state={part.state}
            />
            <ToolContent>
                <ToolInput input={part.input} />
                <ToolOutput
                    output={part.output}
                    errorText={part.errorText ?? undefined}
                />
            </ToolContent>
        </Tool>
    );
}

/** The answer's citations as AI Elements `Sources` (collapsed, with the count). */
export function AiAnswerSources({ sources }: { sources: AiSource[] }) {
    if (sources.length === 0) {
        return null;
    }

    return (
        <Sources>
            <SourcesTrigger count={sources.length} />
            <SourcesContent>
                {sources.map((source) => (
                    <Source
                        key={source.url}
                        href={source.url}
                        title={source.title ?? source.url}
                    />
                ))}
            </SourcesContent>
        </Sources>
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

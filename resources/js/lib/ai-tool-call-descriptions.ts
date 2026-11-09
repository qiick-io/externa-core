import type {
    AiToolCall,
    AiToolCallDescriber,
    AiToolCallDescription,
} from '@/components/ai/ai-answer-parts';
import { describeToolCallGenerically } from '@/components/ai/ai-answer-parts';

/**
 * The sentence each Assistant tool call shows in an answer ("List
 * collections", "Creazione di un item"): one label per tool and action in
 * `ai.toolCalls.<Tool>.<action>` (`_` for single-action tools), the state shown
 * by the line's icon and shimmer. A record's name from the call's input
 * follows as the detail. Unknown tools and actions fall back to the generic
 * sentence, so a new tool never shows raw JSON.
 */

type ToolInput = Record<string, unknown>;

/** Input keys that name the record a call works on, most specific first. */
const RECORD_NAME_KEYS = ['name', 'title', 'collection_name', 'slug', 'query'];

const asRecord = (input: unknown): ToolInput =>
    typeof input === 'object' && input !== null && !Array.isArray(input)
        ? (input as ToolInput)
        : {};

/** The record's name the call mentions, when its input has one. */
const recordNameOf = (input: ToolInput): string | undefined => {
    for (const key of RECORD_NAME_KEYS) {
        const value = input[key];

        if (typeof value === 'string' && value.trim() !== '') {
            return value.trim();
        }
    }

    return undefined;
};

export const describeAssistantToolCall: AiToolCallDescriber = (
    call: AiToolCall,
    t,
): AiToolCallDescription => {
    const input = asRecord(call.input);
    const action =
        typeof input.action === 'string' && input.action !== ''
            ? input.action
            : '_';
    const title = t(`ai.toolCalls.${call.name}.${action}`, {
        defaultValue: '',
    });

    if (title === '') {
        return describeToolCallGenerically(call, t);
    }

    return { title, description: recordNameOf(input) };
};

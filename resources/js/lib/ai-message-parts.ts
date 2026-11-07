/**
 * The parts of one AI answer, in the order the model produced them: reasoning,
 * text, tool calls and provider tools. Built live from the SSE stream and
 * rebuilt from the stored `steps` on reload, so both render the same way.
 *
 * The tool states are the AI Elements / ai-sdk ones; Externa keeps its own SSE
 * and only borrows the vocabulary.
 */

export type AiToolState =
    | 'input-streaming'
    | 'input-available'
    | 'approval-requested'
    | 'output-available'
    | 'output-error'
    | 'output-denied';

export type AiReasoningPart = {
    type: 'reasoning';
    id: string;
    text: string;
    isStreaming: boolean;
    /** Whole seconds spent thinking, when the stream measured it. */
    durationSeconds: number | null;
    /** Internal: when the first delta arrived (ms since epoch). */
    startedAt?: number;
};

export type AiTextPart = { type: 'text'; text: string };

export type AiToolPart = {
    type: 'tool';
    id: string;
    name: string;
    input: unknown;
    state: AiToolState;
    output: unknown;
    errorText: string | null;
};

export type AiProviderToolPart = {
    type: 'provider-tool';
    id: string;
    kind: string;
    data: Record<string, unknown>;
};

export type AiMessagePart =
    AiReasoningPart | AiTextPart | AiToolPart | AiProviderToolPart;

export type AiSource = { url: string; title: string | null };

export type AiUsage = {
    input_tokens?: number;
    output_tokens?: number;
    reasoning_tokens?: number;
    cache_read_input_tokens?: number;
    cache_write_input_tokens?: number;
};

/** One step as the conversation payload sends it (see AiConversationMessagePresenterService). */
export type AiStoredStep = {
    reasoning?: string;
    content?: string;
    tools?: Array<{
        id: string;
        name: string;
        arguments?: unknown;
        state?: AiToolState;
        result?: unknown;
        error?: string | null;
    }>;
    provider_tools?: Array<{
        id: string;
        type: string;
        data?: Record<string, unknown>;
    }>;
};

/** Rebuild the parts of a stored turn, step by step. */
export function partsFromSteps(
    steps: AiStoredStep[] | undefined,
): AiMessagePart[] {
    const parts: AiMessagePart[] = [];

    (steps ?? []).forEach((step, stepIndex) => {
        if (step.reasoning && step.reasoning.trim() !== '') {
            parts.push({
                type: 'reasoning',
                id: `step-${stepIndex}-reasoning`,
                text: step.reasoning,
                isStreaming: false,
                durationSeconds: null,
            });
        }

        for (const providerTool of step.provider_tools ?? []) {
            parts.push({
                type: 'provider-tool',
                id: providerTool.id,
                kind: providerTool.type,
                data: providerTool.data ?? {},
            });
        }

        for (const tool of step.tools ?? []) {
            parts.push({
                type: 'tool',
                id: tool.id,
                name: tool.name,
                input: tool.arguments ?? {},
                state: tool.state ?? 'input-available',
                output: tool.result ?? null,
                errorText: tool.error ?? null,
            });
        }

        if (step.content && step.content.trim() !== '') {
            parts.push({ type: 'text', text: step.content });
        }
    });

    return parts;
}

/** Close every reasoning part still streaming, measuring how long it ran. */
export function closeReasoning(
    parts: AiMessagePart[],
    now: number,
): AiMessagePart[] {
    return parts.map((part) =>
        part.type === 'reasoning' && part.isStreaming
            ? {
                  ...part,
                  isStreaming: false,
                  durationSeconds:
                      part.startedAt !== undefined
                          ? Math.max(
                                1,
                                Math.round((now - part.startedAt) / 1000),
                            )
                          : null,
              }
            : part,
    );
}

/** Append a reasoning delta to its part, opening the part on the first delta. */
export function appendReasoning(
    parts: AiMessagePart[],
    reasoningId: string,
    delta: string,
    now: number,
): AiMessagePart[] {
    const index = parts.findIndex(
        (part) => part.type === 'reasoning' && part.id === reasoningId,
    );

    if (index === -1) {
        return [
            ...parts,
            {
                type: 'reasoning',
                id: reasoningId,
                text: delta,
                isStreaming: true,
                durationSeconds: null,
                startedAt: now,
            },
        ];
    }

    return parts.map((part, partIndex) =>
        partIndex === index && part.type === 'reasoning'
            ? { ...part, text: part.text + delta }
            : part,
    );
}

/** Append answer text, extending the last text part or opening a new one. */
export function appendText(
    parts: AiMessagePart[],
    token: string,
    now: number,
): AiMessagePart[] {
    const closed = closeReasoning(parts, now);
    const last = closed.at(-1);

    if (last?.type === 'text') {
        return [...closed.slice(0, -1), { ...last, text: last.text + token }];
    }

    return [...closed, { type: 'text', text: token }];
}

/** Record a tool call the model made (state input-available). */
export function addToolCall(
    parts: AiMessagePart[],
    call: { id: string; name: string; input: unknown },
    now: number,
): AiMessagePart[] {
    const closed = closeReasoning(parts, now);

    if (closed.some((part) => part.type === 'tool' && part.id === call.id)) {
        return closed;
    }

    return [
        ...closed,
        {
            type: 'tool',
            id: call.id,
            name: call.name,
            input: call.input,
            state: 'input-available',
            output: null,
            errorText: null,
        },
    ];
}

/** Settle a tool call with its result, error or denial. */
export function applyToolResult(
    parts: AiMessagePart[],
    result: {
        id: string;
        name: string;
        output: unknown;
        successful: boolean;
        error: string | null;
        denied: boolean;
    },
): AiMessagePart[] {
    const state: AiToolState = result.denied
        ? 'output-denied'
        : result.successful
          ? 'output-available'
          : 'output-error';
    const settled = {
        state,
        output: result.successful ? result.output : null,
        errorText: result.successful
            ? null
            : (result.error ??
              (typeof result.output === 'string' ? result.output : null)),
    };

    if (!parts.some((part) => part.type === 'tool' && part.id === result.id)) {
        return [
            ...parts,
            {
                type: 'tool',
                id: result.id,
                name: result.name,
                input: {},
                ...settled,
            },
        ];
    }

    return parts.map((part) =>
        part.type === 'tool' && part.id === result.id
            ? { ...part, ...settled }
            : part,
    );
}

/** Mark the tool calls a turn paused on as waiting for the user's approval. */
export function markApprovalRequested(
    parts: AiMessagePart[],
    approvals: Array<{ id: string; tool: string; arguments?: unknown }>,
): AiMessagePart[] {
    let next = parts;

    for (const approval of approvals) {
        if (
            next.some((part) => part.type === 'tool' && part.id === approval.id)
        ) {
            next = next.map((part) =>
                part.type === 'tool' && part.id === approval.id
                    ? { ...part, state: 'approval-requested' as const }
                    : part,
            );
        } else {
            next = [
                ...next,
                {
                    type: 'tool',
                    id: approval.id,
                    name: approval.tool,
                    input: approval.arguments ?? {},
                    state: 'approval-requested',
                    output: null,
                    errorText: null,
                },
            ];
        }
    }

    return next;
}

/** Record a provider-hosted tool (for example a web search) once per id. */
export function addProviderTool(
    parts: AiMessagePart[],
    tool: { id: string; kind: string; data: Record<string, unknown> },
): AiMessagePart[] {
    const index = parts.findIndex(
        (part) => part.type === 'provider-tool' && part.id === tool.id,
    );

    if (index === -1) {
        return [...parts, { type: 'provider-tool', ...tool }];
    }

    return parts.map((part, partIndex) =>
        partIndex === index ? { type: 'provider-tool', ...tool } : part,
    );
}

/** Add a cited source once per URL. */
export function addSource(sources: AiSource[], source: AiSource): AiSource[] {
    return sources.some((entry) => entry.url === source.url)
        ? sources
        : [...sources, source];
}

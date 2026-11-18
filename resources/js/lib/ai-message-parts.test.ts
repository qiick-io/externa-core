import { describe, expect, it } from 'vite-plus/test';
import {
    addProviderTool,
    addSource,
    addToolCall,
    appendReasoning,
    appendText,
    applyToolResult,
    markApprovalRequested,
    partsFromSteps,
} from '@/lib/ai-message-parts';

describe('partsFromSteps', () => {
    it('rebuilds reasoning, provider tools, tools and text in step order', () => {
        expect(
            partsFromSteps([
                {
                    reasoning: 'Plan the change.',
                    content: '',
                    tools: [
                        {
                            id: 'call_1',
                            name: 'ManageFiles',
                            arguments: { action: 'move' },
                            state: 'output-error',
                            result: null,
                            error: 'Folder not found',
                        },
                    ],
                    provider_tools: [
                        {
                            id: 'ws_1',
                            type: 'web_search_call',
                            data: { q: 'x' },
                        },
                    ],
                },
                {
                    reasoning: '',
                    content: 'Done.',
                    tools: [],
                    provider_tools: [],
                },
            ]),
        ).toEqual([
            {
                type: 'reasoning',
                id: 'step-0-reasoning',
                text: 'Plan the change.',
                isStreaming: false,
                durationSeconds: null,
            },
            {
                type: 'provider-tool',
                id: 'ws_1',
                kind: 'web_search_call',
                data: { q: 'x' },
            },
            {
                type: 'tool',
                id: 'call_1',
                name: 'ManageFiles',
                input: { action: 'move' },
                state: 'output-error',
                output: null,
                errorText: 'Folder not found',
            },
            { type: 'text', text: 'Done.' },
        ]);
    });

    it('returns no parts without steps', () => {
        expect(partsFromSteps(undefined)).toEqual([]);
    });
});

describe('live parts', () => {
    it('streams reasoning, closes it with its duration when text starts', () => {
        let parts = appendReasoning([], 'r1', 'Think', 1_000);
        parts = appendReasoning(parts, 'r1', 'ing', 2_000);
        parts = appendText(parts, 'Hello', 4_200);
        parts = appendText(parts, ' world', 4_300);

        expect(parts).toEqual([
            {
                type: 'reasoning',
                id: 'r1',
                text: 'Thinking',
                isStreaming: false,
                durationSeconds: 3,
                startedAt: 1_000,
            },
            { type: 'text', text: 'Hello world' },
        ]);
    });

    it('moves a tool call through running, result, error and denial', () => {
        let parts = addToolCall(
            [],
            { id: 'a', name: 'List', input: { page: 1 } },
            0,
        );
        parts = addToolCall(parts, { id: 'b', name: 'Move', input: {} }, 0);
        parts = addToolCall(parts, { id: 'c', name: 'Delete', input: {} }, 0);

        expect(parts.map((part) => part.type === 'tool' && part.state)).toEqual(
            ['input-available', 'input-available', 'input-available'],
        );

        parts = applyToolResult(parts, {
            id: 'a',
            name: 'List',
            output: { items: 2 },
            successful: true,
            error: null,
            denied: false,
        });
        parts = applyToolResult(parts, {
            id: 'b',
            name: 'Move',
            output: null,
            successful: false,
            error: 'Folder not found',
            denied: false,
        });
        parts = applyToolResult(parts, {
            id: 'c',
            name: 'Delete',
            output: 'Denied',
            successful: false,
            error: null,
            denied: true,
        });

        expect(parts).toMatchObject([
            {
                id: 'a',
                state: 'output-available',
                output: { items: 2 },
                errorText: null,
            },
            { id: 'b', state: 'output-error', errorText: 'Folder not found' },
            { id: 'c', state: 'output-denied' },
        ]);
    });

    it('marks paused tool calls as waiting for approval', () => {
        const parts = markApprovalRequested(
            addToolCall([], { id: 'a', name: 'Delete', input: {} }, 0),
            [
                { id: 'a', tool: 'Delete' },
                { id: 'b', tool: 'Purge', arguments: { all: true } },
            ],
        );

        expect(parts).toMatchObject([
            { id: 'a', state: 'approval-requested' },
            {
                id: 'b',
                name: 'Purge',
                input: { all: true },
                state: 'approval-requested',
            },
        ]);
    });

    it('keeps one provider tool part and one source per id', () => {
        const tool = { id: 'ws', kind: 'web_search_call', data: {} };

        expect(addProviderTool(addProviderTool([], tool), tool)).toHaveLength(
            1,
        );
        expect(
            addSource(addSource([], { url: 'https://a.test', title: 'A' }), {
                url: 'https://a.test',
                title: 'A again',
            }),
        ).toEqual([{ url: 'https://a.test', title: 'A' }]);
    });
});

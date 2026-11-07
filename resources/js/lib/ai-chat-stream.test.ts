import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamAiChat } from '@/lib/ai-chat';

/** A fetch Response whose body streams the given laravel/ai events as SSE. */
function sseResponse(
    events: Array<Record<string, unknown> | string>,
): Response {
    const body = events
        .map(
            (event) =>
                `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`,
        )
        .join('');

    return new Response(new TextEncoder().encode(body), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
    });
}

describe('streamAiChat', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('forwards reasoning, tools with outcomes, citations and usage', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                sseResponse([
                    {
                        type: 'stream_start',
                        provider: 'openai',
                        model: 'gpt-5-mini',
                    },
                    { type: 'reasoning_start', reasoning_id: 'r1' },
                    {
                        type: 'reasoning_delta',
                        reasoning_id: 'r1',
                        delta: 'Think',
                    },
                    { type: 'reasoning_end', reasoning_id: 'r1' },
                    {
                        type: 'tool_call',
                        tool_id: 'call_1',
                        tool_name: 'ManageFiles',
                        arguments: { action: 'move' },
                    },
                    {
                        type: 'tool_result',
                        tool_id: 'call_1',
                        tool_name: 'ManageFiles',
                        result: 'Folder not found',
                        successful: false,
                        error: 'Folder not found',
                        denied: false,
                    },
                    {
                        type: 'tool_result',
                        tool_id: 'call_2',
                        tool_name: 'Preview',
                        result: 'partial',
                        successful: true,
                        preliminary: true,
                    },
                    {
                        type: 'web_search_call',
                        item_id: 'ws_1',
                        data: { query: 'journal' },
                        status: 'completed',
                    },
                    {
                        type: 'citation',
                        citation: {
                            url: 'https://example.test',
                            title: 'Example',
                        },
                    },
                    { type: 'text_start' },
                    { type: 'text_delta', delta: 'Done.' },
                    {
                        type: 'stream_end',
                        reason: 'stop',
                        usage: { input_tokens: 10, output_tokens: 3 },
                    },
                    '[DONE]',
                ]),
            ),
        );

        const handlers = {
            onReasoningDelta: vi.fn(),
            onReasoningEnd: vi.fn(),
            onTool: vi.fn(),
            onToolResult: vi.fn(),
            onProviderTool: vi.fn(),
            onCitation: vi.fn(),
            onStreamStart: vi.fn(),
            onStreamEnd: vi.fn(),
            onToken: vi.fn(),
            onDone: vi.fn(),
        };

        await streamAiChat('Tidy', null, handlers);

        expect(handlers.onStreamStart).toHaveBeenCalledWith({
            provider: 'openai',
            model: 'gpt-5-mini',
        });
        expect(handlers.onReasoningDelta).toHaveBeenCalledWith('r1', 'Think');
        expect(handlers.onReasoningEnd).toHaveBeenCalledWith('r1');
        expect(handlers.onTool).toHaveBeenCalledWith('ManageFiles', {
            id: 'call_1',
            arguments: { action: 'move' },
        });
        expect(handlers.onToolResult).toHaveBeenCalledTimes(1);
        expect(handlers.onToolResult).toHaveBeenCalledWith(
            'ManageFiles',
            'Folder not found',
            {
                id: 'call_1',
                successful: false,
                error: 'Folder not found',
                denied: false,
            },
        );
        expect(handlers.onProviderTool).toHaveBeenCalledWith({
            id: 'ws_1',
            kind: 'web_search_call',
            data: { query: 'journal' },
        });
        expect(handlers.onCitation).toHaveBeenCalledWith({
            url: 'https://example.test',
            title: 'Example',
        });
        expect(handlers.onStreamEnd).toHaveBeenCalledWith({
            input_tokens: 10,
            output_tokens: 3,
        });
        expect(handlers.onToken).toHaveBeenCalledTimes(1);
        expect(handlers.onDone).toHaveBeenCalledWith('Done.');
    });
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    streamAiChat: vi.fn(),
    truncateAiConversationFrom: vi.fn(),
    truncateLastUserMessageIfMatches: vi.fn(),
    uploadAiAttachment: vi.fn(),
    getSpeechRecognitionConstructor: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/lib/i18n', () => ({
    default: {
        t: (key: string, options?: { tools?: string }) =>
            options?.tools ? `${key}:${options.tools}` : key,
    },
}));

vi.mock('@/lib/toast', () => ({
    toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock('@/lib/ai-chat', async (importOriginal) => ({
    ...(await importOriginal<typeof AiChatModule>()),
    streamAiChat: mocks.streamAiChat,
    truncateAiConversationFrom: mocks.truncateAiConversationFrom,
    truncateLastUserMessageIfMatches: mocks.truncateLastUserMessageIfMatches,
    uploadAiAttachment: mocks.uploadAiAttachment,
    getSpeechRecognitionConstructor: mocks.getSpeechRecognitionConstructor,
    stopSpeaking: vi.fn(),
}));

import { settleLoadedAiMessages, useAiChat } from '@/hooks/use-ai-chat';
import type { AiChatMessage, UseAiChatOptions } from '@/hooks/use-ai-chat';
import type * as AiChatModule from '@/lib/ai-chat';
import type { AiStreamHandlers } from '@/lib/ai-chat';

type StreamCall = {
    message: string;
    conversationId: string | null;
    handlers: AiStreamHandlers;
    attachmentIds: string[];
    approvals: Array<{ id: string; approved: boolean }>;
};

/** Makes `streamAiChat` run `script` with the handlers of each call. */
function scriptStream(
    script: (handlers: AiStreamHandlers) => void | Promise<void>,
): StreamCall[] {
    const calls: StreamCall[] = [];

    mocks.streamAiChat.mockImplementation(
        async (
            message: string,
            conversationId: string | null,
            handlers: AiStreamHandlers,
            attachmentIds: string[],
            approvals: Array<{ id: string; approved: boolean }>,
        ) => {
            calls.push({
                message,
                conversationId,
                handlers,
                attachmentIds,
                approvals,
            });
            await script(handlers);
        },
    );

    return calls;
}

function renderAiChat(options: UseAiChatOptions = {}) {
    return renderHook((props: UseAiChatOptions) => useAiChat(props), {
        initialProps: options,
    });
}

async function typeAndSend(
    result: { current: ReturnType<typeof useAiChat> },
    text: string,
): Promise<void> {
    act(() => result.current.setComposer(text));
    await act(async () => {
        await result.current.handleSend();
    });
}

const persistedConversation: AiChatMessage[] = [
    { id: '11', role: 'user', content: 'First question' },
    { id: '12', role: 'assistant', content: 'First answer' },
];

describe('useAiChat', () => {
    beforeEach(() => {
        mocks.getSpeechRecognitionConstructor.mockReturnValue(null);
        mocks.truncateAiConversationFrom.mockResolvedValue(undefined);
        mocks.truncateLastUserMessageIfMatches.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('streams an answer into a new assistant message and reports the settled turn', async () => {
        const onTurnSettled = vi.fn();
        scriptStream((handlers) => {
            handlers.onConversationId?.('conversation-1');
            handlers.onToken?.('Hello');
            handlers.onToken?.(' world');
            handlers.onDone?.('Hello world');
        });
        const { result } = renderAiChat({ onTurnSettled });

        await typeAndSend(result, '  Hi there  ');

        expect(result.current.composer).toBe('');
        expect(result.current.isStreaming).toBe(false);
        expect(result.current.conversationId).toBe('conversation-1');
        expect(result.current.messages).toMatchObject([
            { role: 'user', content: 'Hi there' },
            { role: 'assistant', content: 'Hello world', isError: false },
        ]);
        expect(onTurnSettled).toHaveBeenCalledWith('conversation-1');
    });

    it('sends nothing while offline', async () => {
        const { result } = renderAiChat({ isOffline: true });

        await typeAndSend(result, 'Hi');

        expect(mocks.streamAiChat).not.toHaveBeenCalled();
        expect(result.current.composer).toBe('Hi');
    });

    it('asks for text when only attachments are pending', async () => {
        mocks.uploadAiAttachment.mockResolvedValue({
            id: 'attachment-1',
            name: 'notes.txt',
        });
        const { result } = renderAiChat();

        await act(async () => {
            await result.current.handleAttachmentFiles([
                new File(['notes'], 'notes.txt', { type: 'text/plain' }),
            ]);
        });
        await act(async () => {
            await result.current.handleSend();
        });

        expect(mocks.streamAiChat).not.toHaveBeenCalled();
        expect(mocks.toastError).toHaveBeenCalledWith(
            'ai.writeMessageWithAttachments',
        );
    });

    it('sends uploaded attachments with the prompt and clears them', async () => {
        const calls = scriptStream((handlers) => handlers.onDone?.('Done'));
        mocks.uploadAiAttachment.mockResolvedValue({
            id: 'attachment-1',
            name: 'notes.txt',
        });
        const { result } = renderAiChat();

        await act(async () => {
            await result.current.handleAttachmentFiles([
                new File(['notes'], 'notes.txt', { type: 'text/plain' }),
            ]);
        });
        expect(result.current.pendingAttachments).toHaveLength(1);

        await typeAndSend(result, 'Summarise this');

        expect(calls[0]?.attachmentIds).toEqual(['attachment-1']);
        expect(result.current.pendingAttachments).toEqual([]);
    });

    it('prefixes the prompt in dry-run mode', async () => {
        const calls = scriptStream((handlers) => handlers.onDone?.('Done'));
        const { result } = renderAiChat();

        act(() => result.current.setDryRunMode(true));
        await typeAndSend(result, 'Delete old items');

        expect(calls[0]?.message).toMatch(/^\[SIMULATION MODE\]/);
        expect(calls[0]?.message).toMatch(/Delete old items$/);
    });

    it('restores the composer and drops the turn on Stop', async () => {
        let releaseStream: () => void = () => {};
        scriptStream(async (handlers) => {
            handlers.onConversationId?.('conversation-1');
            handlers.onToken?.('Partial');
            await new Promise<void>((resolve) => {
                releaseStream = resolve;
            });
        });
        const { result } = renderAiChat();

        act(() => result.current.setComposer('Long question'));
        let sending: Promise<void> = Promise.resolve();
        act(() => {
            sending = result.current.handleSend();
        });
        await waitFor(() => expect(result.current.isStreaming).toBe(true));

        act(() => result.current.handleStop());
        releaseStream();
        await act(async () => {
            await sending;
        });

        expect(result.current.isStreaming).toBe(false);
        expect(result.current.composer).toBe('Long question');
        expect(result.current.messages).toEqual([]);
        expect(mocks.truncateLastUserMessageIfMatches).toHaveBeenCalledWith(
            'conversation-1',
            'Long question',
        );
    });

    it('marks the answer as an error when the stream reports one', async () => {
        scriptStream((handlers) =>
            handlers.onError?.(new Error('Model crashed')),
        );
        const { result } = renderAiChat();

        await typeAndSend(result, 'Hi');

        expect(result.current.isStreaming).toBe(false);
        expect(result.current.messages[1]).toMatchObject({
            role: 'assistant',
            content: 'Model crashed',
            isError: true,
        });
    });

    it('shows an error toast when the request fails', async () => {
        mocks.streamAiChat.mockRejectedValue(new Error('Chat send failed'));
        const { result } = renderAiChat();

        await typeAndSend(result, 'Hi');

        expect(mocks.toastError).toHaveBeenCalledWith('Chat send failed');
        expect(result.current.messages[1]).toMatchObject({ isError: true });
    });

    it('writes a fallback answer for a turn that only ran tools', async () => {
        scriptStream((handlers) => {
            handlers.onTool?.('search_items');
            handlers.onDone?.('');
        });
        const { result } = renderAiChat();

        await typeAndSend(result, 'Find items');

        expect(result.current.messages[1]).toMatchObject({
            content: 'ai.toolFallback:search_items',
            toolNames: ['search_items'],
        });
    });

    it('reports the running tool until the turn ends', async () => {
        let releaseStream: () => void = () => {};
        scriptStream(async (handlers) => {
            handlers.onTool?.('search_items');
            await new Promise<void>((resolve) => {
                releaseStream = resolve;
            });
            handlers.onDone?.('Found');
        });
        const { result } = renderAiChat();

        act(() => result.current.setComposer('Find items'));
        let sending: Promise<void> = Promise.resolve();
        act(() => {
            sending = result.current.handleSend();
        });

        await waitFor(() =>
            expect(result.current.runningToolName).toBe('search_items'),
        );
        releaseStream();
        await act(async () => {
            await sending;
        });
        expect(result.current.runningToolName).toBeNull();
    });

    it('pauses for approval and resumes with the decision', async () => {
        const calls = scriptStream((handlers) => {
            if (calls.length === 1) {
                handlers.onApprovalRequest?.([
                    {
                        id: 'approval-1',
                        tool: 'delete_item',
                        arguments: {},
                    },
                ]);
                handlers.onDone?.('');

                return;
            }

            handlers.onDone?.('Deleted.');
        });
        const { result } = renderAiChat();

        await typeAndSend(result, 'Delete item 4');

        const pausedMessage = result.current.messages[1];
        expect(pausedMessage?.pending_approvals).toHaveLength(1);
        expect(pausedMessage?.content).toBe('ai.awaitingApproval');

        await act(async () => {
            await result.current.handleResolveApprovals(
                pausedMessage?.id ?? '',
                true,
            );
        });

        expect(calls[1]).toMatchObject({
            message: '',
            approvals: [{ id: 'approval-1', approved: true }],
        });
        expect(result.current.messages).toHaveLength(3);
        expect(result.current.messages[1]?.pending_approvals).toEqual([]);
        expect(result.current.messages[2]?.content).toBe('Deleted.');
    });

    it('regenerates a stored answer after truncating the server copy', async () => {
        const calls = scriptStream((handlers) =>
            handlers.onDone?.('Better answer'),
        );
        const { result } = renderAiChat({
            initialConversationId: 'conversation-1',
            initialMessages: persistedConversation,
        });

        await act(async () => {
            await result.current.handleRegenerate('12');
        });

        expect(mocks.truncateAiConversationFrom).toHaveBeenCalledWith(
            'conversation-1',
            '11',
        );
        expect(calls[0]?.message).toBe('First question');
        expect(result.current.messages).toMatchObject([
            { role: 'user', content: 'First question' },
            { role: 'assistant', content: 'Better answer' },
        ]);
    });

    it('does not regenerate when the server truncate fails', async () => {
        mocks.truncateAiConversationFrom.mockRejectedValue(new Error('nope'));
        const { result } = renderAiChat({
            initialConversationId: 'conversation-1',
            initialMessages: persistedConversation,
        });

        await act(async () => {
            await result.current.handleRegenerate('12');
        });

        expect(mocks.streamAiChat).not.toHaveBeenCalled();
        expect(mocks.toastError).toHaveBeenCalledWith(
            'ai.unablePrepareRegeneration',
        );
    });

    it('resends an edited message in place of the original', async () => {
        const calls = scriptStream((handlers) =>
            handlers.onDone?.('Edited answer'),
        );
        const { result } = renderAiChat({
            initialConversationId: 'conversation-1',
            initialMessages: persistedConversation,
        });

        act(() => result.current.startEditing(persistedConversation[0]!));
        expect(result.current.editingMessageId).toBe('11');
        act(() => result.current.setEditingDraft('Edited question'));
        await act(async () => {
            await result.current.handleResendEdited('11');
        });

        expect(mocks.truncateAiConversationFrom).toHaveBeenCalledWith(
            'conversation-1',
            '11',
        );
        expect(calls[0]?.message).toBe('Edited question');
        expect(result.current.editingMessageId).toBeNull();
        expect(result.current.messages).toMatchObject([
            { role: 'user', content: 'Edited question' },
            { role: 'assistant', content: 'Edited answer' },
        ]);
    });

    it('refuses to resend an empty edit', async () => {
        const { result } = renderAiChat({
            initialMessages: persistedConversation,
        });

        act(() => result.current.startEditing(persistedConversation[0]!));
        act(() => result.current.setEditingDraft('   '));
        await act(async () => {
            await result.current.handleResendEdited('11');
        });

        expect(mocks.streamAiChat).not.toHaveBeenCalled();
        expect(mocks.toastError).toHaveBeenCalledWith(
            'ai.messageCannotBeEmpty',
        );
    });

    it('seeds a fresh draft and forgets the thread', () => {
        const { result } = renderAiChat({
            initialConversationId: 'conversation-1',
            initialMessages: persistedConversation,
        });

        act(() => result.current.startNewDraft('Explain this row'));

        expect(result.current.messages).toEqual([]);
        expect(result.current.conversationId).toBeNull();
        expect(result.current.composer).toBe('Explain this row');
    });

    it('adds context attachments once each', () => {
        const { result } = renderAiChat();
        const entry = { kind: 'item' as const, id: 4, label: 'Item 4' };

        act(() => result.current.addContextAttachments([entry]));
        act(() => result.current.addContextAttachments([entry]));

        expect(result.current.pendingContextAttachments).toHaveLength(1);

        act(() => result.current.removePendingContextAttachment('item', 4));
        expect(result.current.pendingContextAttachments).toEqual([]);
    });

    it('appends dictated text to the draft', () => {
        const listeners: Record<string, (event: unknown) => void> = {};

        class FakeRecognition {
            lang = '';
            continuous = true;
            interimResults = true;
            start = vi.fn();
            stop = vi.fn();
            abort = vi.fn();
            addEventListener(type: string, listener: (event: unknown) => void) {
                listeners[type] = listener;
            }
        }

        mocks.getSpeechRecognitionConstructor.mockReturnValue(FakeRecognition);
        const { result } = renderAiChat();

        act(() => result.current.setComposer('Hello'));
        act(() => result.current.toggleVoiceInput());
        expect(result.current.isListening).toBe(true);

        act(() =>
            listeners.result?.({
                resultIndex: 0,
                results: [
                    Object.assign([{ transcript: 'from voice' }], {
                        isFinal: true,
                    }),
                ],
            }),
        );
        act(() => listeners.end?.({}));

        expect(result.current.composer).toBe('Hello from voice');
        expect(result.current.isListening).toBe(false);
    });

    it('ignores a conversation load while streaming', async () => {
        let releaseStream: () => void = () => {};
        scriptStream(async (handlers) => {
            await new Promise<void>((resolve) => {
                releaseStream = resolve;
            });
            handlers.onDone?.('Answer');
        });
        const { result } = renderAiChat();

        act(() => result.current.setComposer('Hi'));
        let sending: Promise<void> = Promise.resolve();
        act(() => {
            sending = result.current.handleSend();
        });
        await waitFor(() => expect(result.current.isStreaming).toBe(true));

        act(() => result.current.loadConversation([], 'other'));
        expect(result.current.messages).toHaveLength(2);

        releaseStream();
        await act(async () => {
            await sending;
        });
        act(() =>
            result.current.loadConversation(persistedConversation, 'other'),
        );
        expect(result.current.messages).toEqual(persistedConversation);
        expect(result.current.conversationId).toBe('other');
    });
});

describe('useAiChat answer parts', () => {
    beforeEach(() => {
        mocks.getSpeechRecognitionConstructor.mockReturnValue(null);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('builds reasoning, tool and text parts in stream order', async () => {
        scriptStream((handlers) => {
            handlers.onStreamStart?.({
                provider: 'openai',
                model: 'gpt-5-mini',
            });
            handlers.onReasoningDelta?.('r1', 'Plan it');
            handlers.onReasoningEnd?.('r1');
            handlers.onTool?.('ManageFiles', {
                id: 'call_1',
                arguments: { action: 'move' },
            });
            handlers.onToolResult?.('ManageFiles', 'Folder not found', {
                id: 'call_1',
                successful: false,
                error: 'Folder not found',
                denied: false,
            });
            handlers.onCitation?.({
                url: 'https://example.test',
                title: 'Example',
            });
            handlers.onToken?.('Could not move it.');
            handlers.onStreamEnd?.({ input_tokens: 9, output_tokens: 4 });
            handlers.onDone?.('Could not move it.');
        });
        const { result } = renderAiChat();

        await typeAndSend(result, 'Move the file');

        const answer = result.current.messages[1];

        expect(answer?.parts?.map((part) => part.type)).toEqual([
            'reasoning',
            'tool',
            'text',
        ]);
        expect(answer?.parts?.[1]).toMatchObject({
            state: 'output-error',
            errorText: 'Folder not found',
            input: { action: 'move' },
        });
        expect(answer?.sources).toEqual([
            { url: 'https://example.test', title: 'Example' },
        ]);
        expect(answer?.model).toBe('gpt-5-mini');
        expect(answer?.usage).toEqual({ input_tokens: 9, output_tokens: 4 });
    });

    it('rebuilds the parts of a stored turn on load', () => {
        const { result } = renderAiChat();

        act(() =>
            result.current.loadConversation(
                [
                    {
                        id: '21',
                        role: 'assistant',
                        content: 'Done.',
                        steps: [
                            {
                                reasoning: 'Plan it',
                                content: 'Done.',
                                tools: [],
                                provider_tools: [],
                            },
                        ],
                        citations: [
                            { url: 'https://example.test', title: null },
                        ],
                    },
                ],
                'conversation-1',
            ),
        );

        expect(
            result.current.messages[0]?.parts?.map((part) => part.type),
        ).toEqual(['reasoning', 'text']);
        expect(result.current.messages[0]?.sources).toHaveLength(1);
    });
});

describe('settleLoadedAiMessages', () => {
    it('fills tool-only turns and drops blank assistant messages', () => {
        expect(
            settleLoadedAiMessages([
                { id: '1', role: 'user', content: 'Hi' },
                {
                    id: '2',
                    role: 'assistant',
                    content: '',
                    tool_calls: [{ name: 'search_items' }],
                },
                { id: '3', role: 'assistant', content: '' },
            ]),
        ).toEqual([
            { id: '1', role: 'user', content: 'Hi' },
            {
                id: '2',
                role: 'assistant',
                content: 'ai.toolFallback:search_items',
                tool_calls: [{ name: 'search_items' }],
            },
        ]);
    });
});

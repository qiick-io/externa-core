import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, string>) =>
            options?.tools ? `${key}:${options.tools}` : key,
        i18n: { language: 'en' },
    }),
}));

// Streamdown and shiki load grammars and measure the DOM; the list logic is what is tested here.
vi.mock('@/components/ai-elements/message-response', () => ({
    MessageResponse: ({ children }: { children: ReactNode }) => (
        <div data-test="response">{children}</div>
    ),
}));

vi.mock('@/hooks/use-ai-availability', () => ({
    useAiAvailability: () => ({
        status: { online: true, context_window: 1000 },
    }),
}));

vi.mock('@/components/ai-elements/code-block', () => ({
    CodeBlock: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

import { AiChatMessages } from '@/components/ai/ai-chat-messages';
import type { AiChatMessageView } from '@/components/ai/ai-chat-messages';
import { ChatMessageScroller } from '@/components/chat/chat-message-scroller';
import { TooltipProvider } from '@/components/ui/tooltip';

function renderMessages(
    messages: AiChatMessageView[],
    props: Partial<ComponentProps<typeof AiChatMessages>> = {},
) {
    const handlers = {
        onEditingDraftChange: vi.fn(),
        onCancelEdit: vi.fn(),
        onStartEdit: vi.fn(),
        onResendEdited: vi.fn(),
        onRegenerate: vi.fn(),
        onSuggestedAction: vi.fn(),
        onResolveApprovals: vi.fn(),
    };

    render(
        <TooltipProvider>
            <ChatMessageScroller>
                <AiChatMessages
                    messages={messages}
                    isStreaming={false}
                    editingMessageId={null}
                    editingDraft=""
                    {...handlers}
                    {...props}
                />
            </ChatMessageScroller>
        </TooltipProvider>,
    );

    return handlers;
}

const prompt: AiChatMessageView = {
    id: 'local-user-1',
    role: 'user',
    content: 'Delete item 4',
    attachments: [{ id: 'a1', name: 'notes.txt' } as never],
};

describe('AiChatMessages', () => {
    afterEach(() => {
        cleanup();
    });

    it('shows a thinking status while the answer is still empty', () => {
        renderMessages(
            [
                prompt,
                { id: 'local-assistant-1', role: 'assistant', content: '' },
            ],
            { isStreaming: true },
        );

        expect(screen.getByRole('status')).toHaveTextContent('ai.thinking');
    });

    it('shows the prompt attachments as attachment chips', () => {
        renderMessages([prompt]);

        expect(screen.getByText('notes.txt')).toBeInTheDocument();
        expect(
            document.querySelector('[data-slot="attachment"]'),
        ).not.toBeNull();
    });

    it('asks for approval with the call sentence, never its JSON, and resolves it', () => {
        const handlers = renderMessages([
            prompt,
            {
                id: 'local-assistant-1',
                role: 'assistant',
                content: 'Waiting for your approval to run delete_item.',
                pending_approvals: [
                    {
                        id: 'approval-1',
                        tool: 'delete_item',
                        arguments: { item_id: 4 },
                    },
                ],
            },
        ]);

        expect(
            screen.getByText('ai.toolCalls.delete_item._'),
        ).toBeInTheDocument();
        expect(screen.getByText('ai.approval.hint')).toBeInTheDocument();
        expect(screen.queryByText(/item_id/)).toBeNull();

        fireEvent.click(
            screen.getByRole('button', { name: 'ai.approval.approve' }),
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'ai.approval.reject' }),
        );

        expect(handlers.onResolveApprovals).toHaveBeenNthCalledWith(
            1,
            'local-assistant-1',
            true,
        );
        expect(handlers.onResolveApprovals).toHaveBeenNthCalledWith(
            2,
            'local-assistant-1',
            false,
        );
    });

    it('offers retry on an error answer', () => {
        const handlers = renderMessages([
            prompt,
            {
                id: 'local-assistant-1',
                role: 'assistant',
                content: 'Model crashed',
                isError: true,
            },
        ]);

        fireEvent.click(screen.getByRole('button', { name: /ai.retry/ }));

        expect(handlers.onRegenerate).toHaveBeenCalledWith(
            'local-assistant-1',
            { asRetry: true },
        );
    });

    it('turns the last answer suggestions into prompt chips', () => {
        const handlers = renderMessages([
            prompt,
            {
                id: 'local-assistant-1',
                role: 'assistant',
                content: 'Here are your collections.',
                toolNames: ['ImportCollectionCsv'],
            },
        ]);

        fireEvent.click(
            screen.getByRole('button', {
                name: 'ai.suggestedActions.verifyImport',
            }),
        );

        expect(handlers.onSuggestedAction).toHaveBeenCalledWith(
            'Verify the latest imported items.',
        );
    });

    it('edits a prompt in place and sends it again', () => {
        const handlers = renderMessages([prompt], {
            editingMessageId: prompt.id,
            editingDraft: 'Delete item 5',
        });

        fireEvent.change(
            screen.getByRole('textbox', { name: 'ai.messageAria' }),
            {
                target: { value: 'Delete item 6' },
            },
        );
        fireEvent.click(screen.getByRole('button', { name: 'ai.sendAgain' }));

        expect(handlers.onEditingDraftChange).toHaveBeenCalledWith(
            'Delete item 6',
        );
        expect(handlers.onResendEdited).toHaveBeenCalledWith(prompt.id);
    });

    it('shows the reasoning collapsed, with how long the model thought', () => {
        renderMessages([
            prompt,
            {
                id: 'a1',
                role: 'assistant',
                content: 'Answer.',
                parts: [
                    {
                        type: 'reasoning',
                        id: 'r1',
                        text: 'Hidden chain of thought',
                        isStreaming: false,
                        durationSeconds: 3,
                    },
                    { type: 'text', text: 'Answer.' },
                ],
            },
        ]);

        const trigger = screen.getByRole('button', {
            name: /ai.reasoning.thoughtFor/,
        });

        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText('Hidden chain of thought')).toBeNull();

        fireEvent.click(trigger);

        expect(screen.getByText('Hidden chain of thought')).toBeInTheDocument();
    });

    it('renders one tool call with its state and several as a chain of thought', () => {
        renderMessages([
            prompt,
            {
                id: 'a1',
                role: 'assistant',
                content: 'Done.',
                parts: [
                    {
                        type: 'tool',
                        id: 't1',
                        name: 'ManageFiles',
                        input: { action: 'move' },
                        state: 'output-error',
                        output: null,
                        errorText: 'Folder not found',
                    },
                    { type: 'text', text: 'First.' },
                    {
                        type: 'tool',
                        id: 't2',
                        name: 'ListItems',
                        input: {},
                        state: 'output-available',
                        output: { items: 2 },
                        errorText: null,
                    },
                    {
                        type: 'tool',
                        id: 't3',
                        name: 'DeleteItem',
                        input: {},
                        state: 'output-denied',
                        output: null,
                        errorText: null,
                    },
                    { type: 'text', text: 'Done.' },
                ],
            },
        ]);

        const failedCall = screen.getByText('ai.toolCalls.ManageFiles.move');

        expect(failedCall.closest('[data-slot="trace-line"]')).toHaveAttribute(
            'data-status',
            'error',
        );
        expect(screen.queryByText(/"items"/)).toBeNull();
        expect(
            screen.getByRole('button', { name: /ai.tool.steps/ }),
        ).toBeInTheDocument();
    });

    it('lists the cited sources and the context used', () => {
        renderMessages([
            prompt,
            {
                id: 'a1',
                role: 'assistant',
                content: 'Answer.',
                parts: [{ type: 'text', text: 'Answer.' }],
                sources: [{ url: 'https://example.test/doc', title: 'Doc' }],
                usage: { input_tokens: 200, output_tokens: 50 },
            },
        ]);

        fireEvent.click(
            screen.getByRole('button', { name: /ai.sources.used/ }),
        );

        expect(screen.getByRole('link', { name: 'Doc' })).toHaveAttribute(
            'href',
            'https://example.test/doc',
        );
        expect(
            screen.getByRole('button', { name: /ai.usage.trigger/ }),
        ).toHaveTextContent('25%');
    });
});

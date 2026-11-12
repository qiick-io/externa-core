import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
    fetchMentions: vi.fn(),
    uploadChatAttachment: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/item-chat-api', () => ({
    fetchMentions: mocks.fetchMentions,
    uploadChatAttachment: mocks.uploadChatAttachment,
}));

import { useChatComposer } from '@/components/collections/item-chat/use-chat-composer';

const scope = { mode: 'hub', chatId: 'chat-1' } as const;

function renderComposer(
    overrides: Partial<Parameters<typeof useChatComposer>[0]> = {},
) {
    const options = {
        open: true,
        scope,
        scopeKey: 'hub:chat-1',
        mentionsEnabled: true,
        chatMaxUploadBytes: null,
        textareaRef: { current: null },
        captionTextareaRef: { current: null },
        whisperTyping: vi.fn(),
        enqueuePending: vi.fn(),
        setError: vi.fn(),
        ...overrides,
    };

    return { options, ...renderHook(() => useChatComposer(options)) };
}

describe('useChatComposer', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('sends the draft as a pending message and clears the composer', () => {
        const { options, result } = renderComposer();

        act(() => {
            result.current.onComposerChange('  Hello there  ', 15);
        });

        expect(options.whisperTyping).toHaveBeenCalled();

        act(() => {
            result.current.send();
        });

        expect(options.enqueuePending).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'sending',
                body: 'Hello there',
                mentionedIds: [],
                replyTo: null,
                files: [],
            }),
        );
        expect(options.setError).toHaveBeenCalledWith(null);
        expect(result.current.draft).toBe('');
    });

    it('does not send a blank draft', () => {
        const { options, result } = renderComposer();

        act(() => {
            result.current.onComposerChange('   ', 3);
            result.current.send();
        });

        expect(options.enqueuePending).not.toHaveBeenCalled();
    });

    it('looks up mentions after @ and turns a picked user into a mention id', async () => {
        mocks.fetchMentions.mockResolvedValue({
            users: [{ id: 7, name: 'Ada', email: 'ada@example.test' }],
            collections: [],
        });
        const { options, result } = renderComposer();

        act(() => {
            result.current.onComposerChange('Hi @Ad', 6);
        });

        expect(mocks.fetchMentions).toHaveBeenCalledWith(scope, 'Ad');
        await waitFor(() => {
            expect(result.current.mentionMenu.hits).toHaveLength(1);
        });
        expect(result.current.mentionMenu.isOpen).toBe(true);

        act(() => {
            result.current.pickMention(result.current.mentionMenu.hits[0]!);
        });

        expect(result.current.draft).toBe('Hi @Ada ');
        expect(result.current.mentionMenu.isOpen).toBe(false);

        act(() => {
            result.current.send();
        });

        expect(options.enqueuePending).toHaveBeenCalledWith(
            expect.objectContaining({ mentionedIds: [7] }),
        );
    });

    it('never opens the mention menu when mentions are off', () => {
        const { result } = renderComposer({ mentionsEnabled: false });

        act(() => {
            result.current.onComposerChange('Hi @Ad', 6);
        });

        expect(mocks.fetchMentions).not.toHaveBeenCalled();
        expect(result.current.mentionMenu.isOpen).toBe(false);
    });

    it('moves the draft into the attachment caption and sends the batch with its files', async () => {
        const uploaded = { id: 'att-1', name: 'notes.txt', mime: 'text/plain' };
        mocks.uploadChatAttachment.mockResolvedValue(uploaded);
        const { options, result } = renderComposer();
        const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });

        act(() => {
            result.current.onComposerChange('Caption', 7);
        });
        act(() => {
            result.current.onPickFiles([file]);
        });

        expect(result.current.attachDialogOpen).toBe(true);
        expect(result.current.attachCaption).toBe('Caption');
        expect(result.current.draft).toBe('');
        expect(mocks.uploadChatAttachment).toHaveBeenCalledWith(scope, file, {
            maxBytes: null,
        });
        await waitFor(() => {
            expect(result.current.attachItems[0]?.uploaded).toEqual(uploaded);
        });

        act(() => {
            result.current.sendAttachBatch();
        });

        expect(options.enqueuePending).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'uploading',
                body: 'Caption',
                files: [
                    expect.objectContaining({
                        file,
                        progress: 100,
                        uploadedId: 'att-1',
                    }),
                ],
            }),
        );
        expect(result.current.attachDialogOpen).toBe(false);
        expect(result.current.attachItems).toEqual([]);
    });

    it('clears the draft when the drawer opens again', () => {
        const { result, rerender } = renderHook(
            ({ open }: { open: boolean }) =>
                useChatComposer({
                    open,
                    scope,
                    scopeKey: 'hub:chat-1',
                    mentionsEnabled: true,
                    chatMaxUploadBytes: null,
                    textareaRef: { current: null },
                    captionTextareaRef: { current: null },
                    whisperTyping: vi.fn(),
                    enqueuePending: vi.fn(),
                    setError: vi.fn(),
                }),
            { initialProps: { open: true } },
        );

        act(() => {
            result.current.onComposerChange('Unsent', 6);
        });
        rerender({ open: false });
        rerender({ open: true });

        expect(result.current.draft).toBe('');
    });
});

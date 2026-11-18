import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
    addChatAttachmentToField: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

// The scroller item needs its scroller; the message markup is what this test checks.
vi.mock('@/components/ui/message-scroller', () => ({
    MessageScrollerItem: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/lib/item-chat-api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    addChatAttachmentToField: mocks.addChatAttachmentToField,
}));

import { ItemChatAddToFieldDialog } from '@/components/collections/item-chat/item-chat-add-to-field-dialog';
import { ItemChatMessageItem } from '@/components/collections/item-chat/item-chat-message-item';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ChatAttachment, ItemChatMessage } from '@/lib/item-chat-api';
import type { CollectionFieldRow } from '@/types/collections';

const imageAttachment: ChatAttachment = {
    id: 'att-image',
    name: 'photo.png',
    mime: 'image/png',
    size: 10,
    transferred_file_id: null,
    has_preview: true,
};

const fileAttachment: ChatAttachment = {
    id: 'att-file',
    name: 'notes.pdf',
    mime: 'application/pdf',
    size: 10,
    transferred_file_id: null,
};

function message(attachments: ChatAttachment[]): ItemChatMessage {
    return {
        id: 1,
        body: 'With attachments',
        mentioned_user_ids: [],
        mentioned_users: [],
        user: { id: 2, name: 'Ada' },
        attachments,
        reply_to: null,
        is_pinned: false,
        pinned_at: null,
        reactions: [],
        created_at: '2026-11-12T10:00:00Z',
        updated_at: null,
        can_edit: false,
        can_delete: false,
    };
}

describe('item chat without a thread scope', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('does not copy an attachment into a field', () => {
        render(
            <ItemChatAddToFieldDialog
                attachment={fileAttachment}
                scope={null}
                fileFields={
                    [
                        { id: 1, name: 'files', type: 'files' },
                    ] as CollectionFieldRow[]
                }
                fieldName="files"
                onFieldNameChange={vi.fn()}
                onClose={vi.fn()}
                onError={vi.fn()}
            />,
        );

        const button = screen.getByRole('button', {
            name: 'collections.itemChat.addToField',
        });

        expect(button).toBeDisabled();

        fireEvent.click(button);

        expect(mocks.addChatAttachmentToField).not.toHaveBeenCalled();
    });

    it('renders a message with attachments without their scoped links', () => {
        render(
            <TooltipProvider>
                <ItemChatMessageItem
                    comment={message([imageAttachment, fileAttachment])}
                    isGroupStart
                    previousCreatedAt={null}
                    viewerId={1}
                    scope={null}
                    canCreateFiles={false}
                    hasFileFields={false}
                    actions={{
                        canEdit: false,
                        canDelete: false,
                        isPinned: false,
                        onReply: vi.fn(),
                        onCopy: vi.fn(),
                        onPin: vi.fn(),
                        onReact: vi.fn(),
                        onEdit: vi.fn(),
                        onDelete: vi.fn(),
                    }}
                    isEditing={false}
                    editingDraft=""
                    onEditingDraftChange={vi.fn()}
                    onSaveEdit={vi.fn()}
                    onCancelEdit={vi.fn()}
                    onAttachmentSaved={vi.fn()}
                    onAddToField={vi.fn()}
                    onSelectMessage={vi.fn()}
                    onReact={vi.fn()}
                />
            </TooltipProvider>,
        );

        expect(screen.getByText('With attachments')).toBeInTheDocument();
        expect(screen.queryByText('notes.pdf')).not.toBeInTheDocument();
    });
});

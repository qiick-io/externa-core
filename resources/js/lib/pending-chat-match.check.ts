// ponytail: self-check — run: node --experimental-strip-types resources/js/lib/pending-chat-match.check.ts
import assert from 'node:assert/strict';

import { pendingMatchesEchoMessage } from './pending-chat-match.ts';

const basePending = {
    clientId: 'pending-1',
    status: 'sending' as const,
    body: 'hello',
    mentionedUsers: [],
    mentionedCollections: [],
    mentionedIds: [],
    replyTo: null,
    files: [] as Array<{
        key: string;
        file: File;
        previewUrl: string | null;
        progress: number;
        uploadedId: string | null;
        error: string | null;
    }>,
    error: null,
};

const baseMessage = {
    id: 1,
    body: 'hello',
    mentioned_user_ids: [],
    mentioned_users: [],
    user: { id: 1, name: 'A' },
    attachments: [] as Array<{
        id: string;
        name: string;
        mime: string;
        size: number;
        transferred_file_id: number | null;
    }>,
    reply_to: null,
    is_pinned: false,
    pinned_at: null,
    reactions: [],
    created_at: null,
    updated_at: null,
    can_edit: true,
    can_delete: true,
};

assert.equal(
    pendingMatchesEchoMessage(basePending, baseMessage),
    true,
);
assert.equal(
    pendingMatchesEchoMessage(
        { ...basePending, status: 'uploading' },
        baseMessage,
    ),
    false,
);
assert.equal(
    pendingMatchesEchoMessage({ ...basePending, body: 'other' }, baseMessage),
    false,
);
assert.equal(
    pendingMatchesEchoMessage(
        {
            ...basePending,
            files: [
                {
                    key: 'a',
                    file: { name: 'a.png', type: 'image/png' } as File,
                    previewUrl: null,
                    progress: 100,
                    uploadedId: 'att-1',
                    error: null,
                },
            ],
        },
        {
            ...baseMessage,
            attachments: [
                {
                    id: 'att-1',
                    name: 'a.png',
                    mime: 'image/png',
                    size: 1,
                    transferred_file_id: null,
                },
            ],
        },
    ),
    true,
);

console.log('pending-chat-match.check.ts: ok');

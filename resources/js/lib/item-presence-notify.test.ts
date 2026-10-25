import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    joinItemPresence,
    leaveItemPresence,
    notifyItemSaved,
} from './item-presence.ts';

function mockEcho() {
    const whisper = vi.fn();
    const channel = {
        here: vi.fn().mockReturnThis(),
        joining: vi.fn().mockReturnThis(),
        leaving: vi.fn().mockReturnThis(),
        listenForWhisper: vi.fn().mockReturnThis(),
        whisper,
    };
    const echo = {
        join: vi.fn().mockReturnValue(channel),
        leave: vi.fn(),
    };

    return { echo, channel, whisper };
}

describe('notifyItemSaved', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    it('whispers item-updated-at on the active presence channel', () => {
        const { echo, whisper } = mockEcho();

        joinItemPresence(echo as never, {
            collectionId: 1,
            itemId: 2,
            viewerId: 9,
            viewerName: 'Editor',
            loadedUpdatedAt: '2026-10-24T10:00:00.000000Z',
        });

        whisper.mockClear();
        notifyItemSaved('2026-10-24T10:05:00.000000Z');

        expect(whisper).toHaveBeenCalledWith('item-updated-at', {
            userId: 9,
            updatedAt: '2026-10-24T10:05:00.000000Z',
        });

        leaveItemPresence(echo as never);
    });
});

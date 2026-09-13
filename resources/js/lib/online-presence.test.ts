import assert from 'node:assert/strict';
import test from 'node:test';
import {
    joinOnlinePresence,
    leaveOnlinePresence,
    resetOnlinePresenceForTests,
    subscribeOnlineUsers,
} from './online-presence.ts';

type PresenceHandlers = {
    here: (users: { id: number }[]) => void;
    joining: (user: { id: number }) => void;
    leaving: (user: { id: number }) => void;
};

function mockEcho() {
    const handlers: Partial<PresenceHandlers> = {};

    return {
        handlers,
        join() {
            return {
                here(cb: PresenceHandlers['here']) {
                    handlers.here = cb;

                    return this;
                },
                joining(cb: PresenceHandlers['joining']) {
                    handlers.joining = cb;

                    return this;
                },
                leaving(cb: PresenceHandlers['leaving']) {
                    handlers.leaving = cb;

                    return this;
                },
            };
        },
        leave(channel: string) {
            assert.equal(channel, 'online');
        },
    };
}

test('joinOnlinePresence tracks here, joining, and leaving once', () => {
    resetOnlinePresenceForTests();

    const echo = mockEcho();
    const seen: number[][] = [];
    const unsubscribe = subscribeOnlineUsers((ids) => {
        seen.push([...ids]);
    });

    joinOnlinePresence(echo as never);
    joinOnlinePresence(echo as never);

    echo.handlers.here?.([{ id: 1 }, { id: 2 }]);
    echo.handlers.joining?.({ id: 3 });
    echo.handlers.leaving?.({ id: 2 });

    assert.deepEqual(seen.at(-1), [1, 3]);

    leaveOnlinePresence(echo as never);
    assert.deepEqual(seen.at(-1), []);

    unsubscribe();
});

// ponytail: self-check — run: node --experimental-strip-types resources/js/lib/chat-thread-identity.check.ts
import assert from 'node:assert/strict';

import {
    CHAT_AVATAR_MAX_VISIBLE,
    chatAvatarStackPlan,
    chatMentionsEnabled,
    initialsFromName,
    itemChatTitle,
    itemLabelFromData,
    otherUserFaces,
} from './chat-thread-identity.ts';

assert.equal(CHAT_AVATAR_MAX_VISIBLE, 3);

assert.deepEqual(chatAvatarStackPlan(0), { shown: 0, overflow: 0 });
assert.deepEqual(chatAvatarStackPlan(1), { shown: 1, overflow: 0 });
assert.deepEqual(chatAvatarStackPlan(3), { shown: 3, overflow: 0 });
assert.deepEqual(chatAvatarStackPlan(4), { shown: 2, overflow: 2 });
assert.deepEqual(chatAvatarStackPlan(5), { shown: 2, overflow: 3 });
assert.deepEqual(chatAvatarStackPlan(5, 4), { shown: 3, overflow: 2 });

assert.equal(initialsFromName('Super Admin'), 'SA');
assert.equal(initialsFromName('Ada'), 'A');
assert.equal(initialsFromName('  '), '?');

assert.deepEqual(
    otherUserFaces(
        [
            { type: 'user', id: 1, name: 'Me' },
            { type: 'user', id: 2, name: 'Ada' },
            { type: 'group', id: 9, name: 'Ops' },
        ],
        1,
    ),
    [{ type: 'user', id: 2, name: 'Ada' }],
);

assert.equal(
    chatMentionsEnabled(
        'direct',
        [
            { type: 'user', id: 1, name: 'Me' },
            { type: 'user', id: 2, name: 'Ada' },
        ],
        1,
    ),
    false,
);
assert.equal(
    chatMentionsEnabled(
        'direct',
        [
            { type: 'user', id: 1, name: 'Me' },
            { type: 'user', id: 2, name: 'Ada' },
            { type: 'user', id: 3, name: 'Bob' },
        ],
        1,
    ),
    true,
);
assert.equal(
    chatMentionsEnabled(
        'direct',
        [
            { type: 'user', id: 1, name: 'Me' },
            { type: 'group', id: 9, name: 'Ops' },
        ],
        1,
    ),
    true,
);
assert.equal(chatMentionsEnabled('item', [], 1), true);

assert.equal(itemChatTitle('Kitchen', 'Sink'), 'Kitchen · Sink');
assert.equal(itemChatTitle('Kitchen', ''), 'Kitchen');
assert.equal(itemLabelFromData({ title: 'Sink' }, 7), 'Sink');
assert.equal(itemLabelFromData({ title: { en: 'Sink' } }, 7), 'Sink');
assert.equal(itemLabelFromData({}, 7), '#7');

console.log('chat-thread-identity.check.ts ok');

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    applyReactionToggle,
    type ReactionRow,
} from './item-chat-reactions.ts';

test('applyReactionToggle stacks users for same emoji', () => {
    let reactions: ReactionRow[] = [];

    reactions = applyReactionToggle(
        reactions,
        '❤️',
        true,
        { id: 1, name: 'Ada' },
        true,
    );
    assert.equal(reactions.length, 1);
    assert.equal(reactions[0]?.count, 1);
    assert.equal(reactions[0]?.reacted, true);
    assert.deepEqual(reactions[0]?.users, [{ id: 1, name: 'Ada' }]);

    reactions = applyReactionToggle(
        reactions,
        '❤️',
        true,
        { id: 2, name: 'Bob' },
        false,
    );
    assert.equal(reactions[0]?.count, 2);
    assert.equal(reactions[0]?.reacted, true);
    assert.equal(reactions[0]?.users.length, 2);

    reactions = applyReactionToggle(
        reactions,
        '❤️',
        false,
        { id: 1, name: 'Ada' },
        true,
    );
    assert.equal(reactions[0]?.count, 1);
    assert.equal(reactions[0]?.reacted, false);
    assert.deepEqual(reactions[0]?.users, [{ id: 2, name: 'Bob' }]);
});

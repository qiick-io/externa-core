// ponytail: self-check — run: node --experimental-strip-types resources/js/lib/item-chat-mentions.check.ts
import assert from 'node:assert/strict';

import {
    collectionMentionLabel,
    composeBodyForSubmit,
    mentionDisplayLabel,
    mentionQueryAt,
    storedBodyToDraft,
} from './item-chat-mentions.ts';

const ada = { id: 2, name: 'Super Admin', email: 'ada@example.com' };
const bob = { id: 3, name: 'Bob', email: 'bob@example.com' };
const kitchen = { id: 4, name: 'Kitchen Sink' };

assert.equal(mentionDisplayLabel(ada), '@Super Admin');
assert.equal(collectionMentionLabel(kitchen), '@collection:Kitchen Sink');

const draft = `Hey ${mentionDisplayLabel(ada)} please review`;
const submitted = composeBodyForSubmit(draft, [ada]);
assert.equal(submitted.body, 'Hey @[user:2] please review');
assert.deepEqual(submitted.mentionedIds, [2]);

assert.equal(
    storedBodyToDraft('Hey @[user:2] please review', [ada]),
    draft,
);

const withCollection = composeBodyForSubmit(
    `See ${collectionMentionLabel(kitchen)} and ${mentionDisplayLabel(ada)}`,
    [ada],
    [kitchen],
);
assert.equal(
    withCollection.body,
    'See @[collection:4] and @[user:2]',
);
assert.deepEqual(withCollection.mentionedIds, [2]);

assert.equal(
    storedBodyToDraft('See @[collection:4] and @[user:2]', [ada], [kitchen]),
    `See ${collectionMentionLabel(kitchen)} and ${mentionDisplayLabel(ada)}`,
);

const longerFirst = composeBodyForSubmit(
    `${mentionDisplayLabel(ada)} and ${mentionDisplayLabel(bob)}`,
    [bob, ada],
);
assert.equal(longerFirst.body, '@[user:2] and @[user:3]');
assert.deepEqual(longerFirst.mentionedIds, [2, 3]);

assert.deepEqual(mentionQueryAt('hello @sup', 10), { start: 6, q: 'sup' });
assert.deepEqual(mentionQueryAt('🚀@', '🚀@'.length), { start: 2, q: '' });
assert.deepEqual(mentionQueryAt('🚀@Test', '🚀@Test'.length), {
    start: 2,
    q: 'Test',
});
assert.equal(mentionQueryAt('@[user:2]', 9), null);
assert.equal(mentionQueryAt('@[collection:4]', 16), null);

console.log('item-chat-mentions.check.ts ok');

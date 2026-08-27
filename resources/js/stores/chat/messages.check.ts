// ponytail: self-check — run: node --experimental-strip-types resources/js/stores/chat/messages.check.ts
import assert from 'node:assert/strict';

import {
    MESSAGES_CACHE_MAX,
    appendMessageDedupe,
    dedupeMessagesById,
    mergeLatestPage,
    prependOlderDedupe,
    threadMatchesPrivateQuery,
    threadsCacheKey,
    touchLruOrder,
    upsertThreadInList,
} from './types.ts';

assert.equal(threadsCacheKey('collection', ''), 'collection|');
assert.equal(threadsCacheKey('private', 'ada'), 'private|ada');

assert.equal(
    threadMatchesPrivateQuery(
        { title: 'Ada', last_message: null, participants: [] } as never,
        '',
    ),
    true,
);
assert.equal(
    threadMatchesPrivateQuery(
        {
            title: 'Ada Lovelace',
            last_message: { body: 'hi' },
            participants: [{ name: 'Ada' }],
        } as never,
        'love',
    ),
    true,
);
assert.equal(
    threadMatchesPrivateQuery(
        { title: 'Bob', last_message: null, participants: [] } as never,
        'ada',
    ),
    false,
);

const t1 = { id: 'a', title: 'A', unread_count: 0 } as never;
const t2 = { id: 'b', title: 'B', unread_count: 0 } as never;
const t1b = { id: 'a', title: 'A2', unread_count: 1 } as never;

assert.deepEqual(upsertThreadInList([t2] as never, t1 as never), [
    t1,
    t2,
] as never);
assert.deepEqual(upsertThreadInList([t1, t2] as never, t1b as never), [
    { ...t1, ...t1b },
    t2,
] as never);
assert.deepEqual(upsertThreadInList([t2, t1] as never, t1b as never), [
    { ...t1, ...t1b },
    t2,
] as never);

const a = { id: 1 } as { id: number };
const b = { id: 2 } as { id: number };
const c = { id: 3 } as { id: number };
const d = { id: 4 } as { id: number };
const dup = { id: 1 } as { id: number };

assert.deepEqual(
    dedupeMessagesById([a, b, dup] as never),
    [a, b] as never,
);
assert.deepEqual(appendMessageDedupe([a] as never, b as never), [a, b] as never);
assert.deepEqual(appendMessageDedupe([a] as never, dup as never), [a] as never);
assert.deepEqual(
    prependOlderDedupe([c, d] as never, [a, b, c] as never),
    [a, b, c, d] as never,
);

const merged = mergeLatestPage(
    [a, b, c, d] as never,
    [c, d] as never,
    true,
    true,
);
assert.deepEqual(merged.messages, [a, b, c, d] as never);
assert.equal(merged.hasMore, true);

const mergedFresh = mergeLatestPage(
    [c, d] as never,
    [c, d] as never,
    false,
    true,
);
assert.deepEqual(mergedFresh.messages, [c, d] as never);
assert.equal(mergedFresh.hasMore, true);

const mergedDone = mergeLatestPage(
    [a, b, c, d] as never,
    [c, d] as never,
    false,
    true,
);
assert.equal(mergedDone.hasMore, false);

const lru = touchLruOrder(['a', 'b', 'c'], 'b', 3);
assert.deepEqual(lru.order, ['a', 'c', 'b']);
assert.deepEqual(lru.evicted, []);

const full = touchLruOrder(
    Array.from({ length: MESSAGES_CACHE_MAX }, (_, i) => `c${i}`),
    'new',
    MESSAGES_CACHE_MAX,
);
assert.equal(full.order.length, MESSAGES_CACHE_MAX);
assert.equal(full.order.at(-1), 'new');
assert.deepEqual(full.evicted, ['c0']);

console.log('messages.check.ts ok');

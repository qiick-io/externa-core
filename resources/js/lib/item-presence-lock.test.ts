import assert from 'node:assert/strict';
import test from 'node:test';
import {
    applyLockWhisper,
    buildLockClaim,
    isLockActive,
    lockHeldByOther,
} from './item-presence-lock.ts';

test('lock claim and expiry', () => {
    const now = 1_000_000;
    const claim = buildLockClaim(7, 'Ada', now);

    assert.equal(isLockActive(claim, now), true);
    assert.equal(isLockActive(claim, now + 30_001), false);
    assert.equal(lockHeldByOther(claim, 7, now), false);
    assert.equal(lockHeldByOther(claim, 3, now), true);
});

test('applyLockWhisper keeps the newest lock', () => {
    const now = 2_000_000;
    const first = buildLockClaim(1, 'A', now);
    const second = applyLockWhisper(first, {
        userId: 2,
        name: 'B',
        until: now + 5_000,
    });

    assert.equal(second?.userId, 2);

    const stale = applyLockWhisper(second, {
        userId: 2,
        name: 'B',
        until: now - 1,
    });

    assert.equal(stale, null);
});

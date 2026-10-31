import { expect, test } from 'vitest';
import {
    applyLockWhisper,
    buildLockClaim,
    isLockActive,
    lockHeldByOther,
} from './item-presence-lock.ts';

test('lock claim and expiry', () => {
    const now = 1_000_000;
    const claim = buildLockClaim(7, 'Ada', now);

    expect(isLockActive(claim, now)).toBe(true);
    expect(isLockActive(claim, now + 30_001)).toBe(false);
    expect(lockHeldByOther(claim, 7, now)).toBe(false);
    expect(lockHeldByOther(claim, 3, now)).toBe(true);
});

test('applyLockWhisper keeps the longer-lived lock', () => {
    const now = 2_000_000;
    const first = buildLockClaim(1, 'A', now);
    const shorter = applyLockWhisper(
        first,
        {
            userId: 2,
            name: 'B',
            until: now + 5_000,
        },
        now,
    );

    expect(shorter?.userId).toBe(1);

    const longer = applyLockWhisper(
        first,
        {
            userId: 2,
            name: 'B',
            until: now + 60_000,
        },
        now,
    );

    expect(longer?.userId).toBe(2);

    const stale = applyLockWhisper(
        longer,
        {
            userId: 2,
            name: 'B',
            until: now - 1,
        },
        now,
    );

    expect(stale).toBe(null);
});

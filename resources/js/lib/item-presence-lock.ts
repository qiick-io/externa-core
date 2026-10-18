export type ItemLockState = {
    userId: number;
    name: string;
    until: number;
};

export const ITEM_LOCK_TTL_MS = 30_000;

export function isLockActive(
    lock: ItemLockState | null,
    now = Date.now(),
): boolean {
    return lock !== null && lock.until > now;
}

export function lockHeldByOther(
    lock: ItemLockState | null,
    viewerId: number,
    now = Date.now(),
): boolean {
    return isLockActive(lock, now) && lock!.userId !== viewerId;
}

export function applyLockWhisper(
    current: ItemLockState | null,
    payload: { userId?: number; name?: string; until?: number },
    now = Date.now(),
): ItemLockState | null {
    const userId = Number(payload.userId);
    const until = Number(payload.until);

    if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(until)) {
        return current;
    }

    if (until <= now) {
        if (current?.userId === userId) {
            return null;
        }

        return current;
    }

    if (
        current !== null &&
        current.until > until &&
        current.userId !== userId
    ) {
        return current;
    }

    const name =
        typeof payload.name === 'string' && payload.name.trim() !== ''
            ? payload.name.trim()
            : (current?.name ?? `User ${userId}`);

    return { userId, name, until };
}

export function buildLockClaim(
    viewerId: number,
    viewerName: string,
    now = Date.now(),
): ItemLockState {
    return {
        userId: viewerId,
        name: viewerName,
        until: now + ITEM_LOCK_TTL_MS,
    };
}

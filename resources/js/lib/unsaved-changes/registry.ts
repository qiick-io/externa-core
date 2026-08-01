export type UnsavedChangesScope = 'drawer' | 'page';

/** Lower number = higher priority when multiple sources are dirty. */
const SCOPE_PRIORITY: Record<UnsavedChangesScope, number> = {
    drawer: 1,
    page: 2,
};

export type UnsavedChangesDialogCopy = {
    titleKey?: string;
    descriptionKey?: string;
    discardKey?: string;
};

export type UnsavedChangesEntry = {
    id: symbol;
    scope: UnsavedChangesScope;
    isDirty: () => boolean;
    onDiscard?: () => void;
    dialogCopy?: UnsavedChangesDialogCopy;
    registeredAt: number;
};

const registrations = new Map<symbol, UnsavedChangesEntry>();
const listeners = new Set<() => void>();

export function subscribeUnsavedChangesRegistry(
    listener: () => void,
): () => void {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

export function notifyUnsavedChangesRegistry(): void {
    listeners.forEach((listener) => listener());
}

export function registerUnsavedChangesEntry(
    entry: Omit<UnsavedChangesEntry, 'registeredAt'>,
): () => void {
    registrations.set(entry.id, { ...entry, registeredAt: Date.now() });
    notifyUnsavedChangesRegistry();

    return () => {
        registrations.delete(entry.id);
        notifyUnsavedChangesRegistry();
    };
}

export function getActiveUnsavedChangesEntry(): UnsavedChangesEntry | null {
    const dirty = Array.from(registrations.values()).filter((entry) =>
        entry.isDirty(),
    );

    if (dirty.length === 0) {
        return null;
    }

    return dirty.reduce((active, candidate) => {
        const activePriority = SCOPE_PRIORITY[active.scope];
        const candidatePriority = SCOPE_PRIORITY[candidate.scope];

        if (candidatePriority < activePriority) {
            return candidate;
        }

        if (candidatePriority > activePriority) {
            return active;
        }

        return candidate.registeredAt >= active.registeredAt
            ? candidate
            : active;
    });
}

export function hasUnsavedChangesInRegistry(): boolean {
    return getActiveUnsavedChangesEntry() !== null;
}

/** @internal Test helper */
export function clearUnsavedChangesRegistryForTests(): void {
    registrations.clear();
}

/** @internal Test helper */
export function getUnsavedChangesRegistrySizeForTests(): number {
    return registrations.size;
}

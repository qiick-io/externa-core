import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { fetchAiStatus } from '@/lib/ai-chat';
import type { AiStatus } from '@/lib/ai-chat';

/** How often the shared probe re-checks `/ai/status` while anything is subscribed. */
const AI_STATUS_REFRESH_MS = 15_000;

let currentAiStatus: AiStatus = { online: false };
const aiStatusListeners = new Set<() => void>();
let stopAiStatusProbe: (() => void) | null = null;

/**
 * Starts the single shared `/ai/status` probe: once now, on window focus and every 15s.
 *
 * @returns Cleanup that aborts the in-flight request and stops polling
 */
function startAiStatusProbe(): () => void {
    const abortController = new AbortController();

    const refresh = async (): Promise<void> => {
        const next = await fetchAiStatus(abortController.signal);

        if (abortController.signal.aborted) {
            return;
        }

        currentAiStatus = next;
        aiStatusListeners.forEach((listener) => listener());
    };

    void refresh();

    const onFocus = (): void => {
        void refresh();
    };

    window.addEventListener('focus', onFocus);
    const intervalId = window.setInterval(onFocus, AI_STATUS_REFRESH_MS);

    return () => {
        abortController.abort();
        window.removeEventListener('focus', onFocus);
        window.clearInterval(intervalId);
    };
}

/**
 * Store subscription: the first subscriber starts the probe, the last one stops it.
 *
 * @param listener - Called whenever the shared status changes
 * @returns Unsubscribe callback
 */
function subscribeToAiStatus(listener: () => void): () => void {
    aiStatusListeners.add(listener);

    if (stopAiStatusProbe === null) {
        stopAiStatusProbe = startAiStatusProbe();
    }

    return () => {
        aiStatusListeners.delete(listener);

        if (aiStatusListeners.size === 0 && stopAiStatusProbe !== null) {
            stopAiStatusProbe();
            stopAiStatusProbe = null;
        }
    };
}

function subscribeToNothing(): () => void {
    return () => {};
}

function readAiStatus(): AiStatus {
    return currentAiStatus;
}

export type AiAvailability = {
    /** User has `CanUseAi`; without it every AI entry point stays hidden. */
    canUseAi: boolean;
    /** AI provider reachable (last shared probe); false until the first probe answers. */
    isAvailable: boolean;
    /** Translated reason to show on disabled AI controls, `null` while available. */
    unavailableReason: string | null;
    status: AiStatus;
};

/**
 * Shared AI availability for every "Ask AI" entry point and the AI FAB.
 *
 * One `/ai/status` probe runs for the whole page no matter how many components
 * subscribe; users without `CanUseAi` never start it.
 *
 * @returns Permission, availability, offline reason and raw status
 */
export function useAiAvailability(): AiAvailability {
    const { t } = useTranslation();
    const { can } = useCan();
    const canUseAi = can(PermissionEnum.CanUseAi);
    const status = useSyncExternalStore(
        canUseAi ? subscribeToAiStatus : subscribeToNothing,
        readAiStatus,
        readAiStatus,
    );
    const isAvailable = canUseAi && status.online === true;

    return {
        canUseAi,
        isAvailable,
        unavailableReason: isAvailable ? null : t('ai.aiOfflineHint'),
        status,
    };
}

/**
 * Test-only reset of the shared probe state between Vitest cases.
 */
export function resetAiAvailabilityForTests(): void {
    stopAiStatusProbe?.();
    stopAiStatusProbe = null;
    aiStatusListeners.clear();
    currentAiStatus = { online: false };
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fetchAiImportJobStatus, nextImportPollDelay } from '@/lib/ai-chat';
import type { AiImportJobStatus } from '@/lib/ai-chat';

/**
 * Reads the background import job id from an AI tool result, which arrives
 * either as a JSON string or as an already parsed object.
 * @param {unknown} result - Raw tool result from the stream.
 * @returns {string | null}
 */
export function importJobIdFromToolResult(result: unknown): string | null {
    const parsed =
        typeof result === 'string'
            ? (() => {
                  try {
                      return JSON.parse(result) as unknown;
                  } catch {
                      return null;
                  }
              })()
            : result;

    if (!parsed || typeof parsed !== 'object' || !('job_id' in parsed)) {
        return null;
    }

    return typeof parsed.job_id === 'string' ? parsed.job_id : null;
}

/**
 * Polls the status of the AI import job the assistant started, for the
 * marker under the thread. Polling pauses while the tab is hidden and resumes
 * on return; failed checks back off and give up after a few attempts (#441).
 * @returns {{ importJobStatus: AiImportJobStatus | null, startImportPoll: (jobId: string) => void }}
 */
export function useAiImportJobPoll() {
    const [importJobStatus, setImportJobStatus] =
        useState<AiImportJobStatus | null>(null);
    const importPollTimeoutRef = useRef<number | null>(null);
    const importPollJobIdRef = useRef<string | null>(null);
    const importPollActiveRef = useRef(false);
    const importPollFailuresRef = useRef(0);

    const clearImportPoll = (): void => {
        if (importPollTimeoutRef.current != null) {
            window.clearTimeout(importPollTimeoutRef.current);
            importPollTimeoutRef.current = null;
        }
    };

    const runImportPollRef = useRef<(jobId: string) => Promise<void>>(
        async () => {},
    );

    // Latest-value ref: timers and the visibility listener always call the
    // current poll step.
    useLayoutEffect(() => {
        runImportPollRef.current = async (jobId: string): Promise<void> => {
            if (importPollJobIdRef.current !== jobId) {
                return;
            }

            if (document.hidden) {
                return;
            }

            const scheduleNextPoll = (delay: number): void => {
                clearImportPoll();
                importPollTimeoutRef.current = window.setTimeout(() => {
                    void runImportPollRef.current(jobId);
                }, delay);
            };

            try {
                const status = await fetchAiImportJobStatus(jobId);

                if (importPollJobIdRef.current !== jobId) {
                    return;
                }

                importPollFailuresRef.current = 0;
                setImportJobStatus(status);

                if (status.status === 'queued' || status.status === 'running') {
                    scheduleNextPoll(nextImportPollDelay(0) ?? 2000);
                } else {
                    importPollActiveRef.current = false;
                }
            } catch {
                if (importPollJobIdRef.current !== jobId) {
                    return;
                }

                // A failed check (network blip, deploy, 502) retries with backoff instead of
                // stopping the poll for good; the last known status stays on screen (#441).
                importPollFailuresRef.current += 1;
                const delay = nextImportPollDelay(
                    importPollFailuresRef.current,
                );

                if (delay === null) {
                    setImportJobStatus(null);
                    importPollActiveRef.current = false;
                } else {
                    scheduleNextPoll(delay);
                }
            }
        };
    });

    const startImportPoll = (jobId: string): void => {
        clearImportPoll();
        importPollJobIdRef.current = jobId;
        importPollActiveRef.current = true;
        importPollFailuresRef.current = 0;
        void runImportPollRef.current(jobId);
    };

    useEffect(() => {
        const onVisibilityChange = (): void => {
            const jobId = importPollJobIdRef.current;

            if (!document.hidden && jobId && importPollActiveRef.current) {
                void runImportPollRef.current(jobId);
            }
        };

        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            document.removeEventListener(
                'visibilitychange',
                onVisibilityChange,
            );
            clearImportPoll();
            importPollJobIdRef.current = null;
            importPollActiveRef.current = false;
        };
    }, []);

    return { importJobStatus, startImportPoll };
}

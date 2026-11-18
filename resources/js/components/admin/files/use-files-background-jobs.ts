import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadPreparedZipUrl } from '@/lib/files-api';
import {
    fetchNotifications,
    notifyNotificationsUpdated,
} from '@/lib/notifications-api';
import { toast } from '@/lib/toast';

// ponytail: no websockets — poll notifications while duplication jobs are pending.
const BACKGROUND_JOB_POLL_INTERVAL_MS = 2_500;

/**
 * Tracks the file manager's queued jobs (duplication, ZIP download, empty trash)
 * and polls notifications until each one reports completion or failure.
 *
 * Polling only runs while at least one job is pending. Completed duplications
 * and trash runs refresh the list through `refreshPage`; a ready ZIP shows a
 * toast with its download link.
 */
export function useFilesBackgroundJobs(refreshPage: () => void) {
    const { t } = useTranslation();
    const pendingDuplicationJobIdsRef = useRef(new Set<string>());
    const [pendingDuplicationJobCount, setPendingDuplicationJobCount] =
        useState(0);
    const pendingZipJobIdsRef = useRef(new Set<string>());
    const [pendingZipJobCount, setPendingZipJobCount] = useState(0);
    const pendingTrashJobIdsRef = useRef(new Set<string>());
    const [pendingTrashJobCount, setPendingTrashJobCount] = useState(0);

    const trackPendingDuplication = useCallback((jobId: string) => {
        pendingDuplicationJobIdsRef.current.add(jobId);
        setPendingDuplicationJobCount(pendingDuplicationJobIdsRef.current.size);
    }, []);

    const trackPendingZip = useCallback((jobId: string) => {
        pendingZipJobIdsRef.current.add(jobId);
        setPendingZipJobCount(pendingZipJobIdsRef.current.size);
    }, []);

    const trackPendingTrash = useCallback((jobId: string) => {
        pendingTrashJobIdsRef.current.add(jobId);
        setPendingTrashJobCount(pendingTrashJobIdsRef.current.size);
    }, []);

    useEffect(() => {
        if (
            pendingDuplicationJobCount === 0 &&
            pendingZipJobCount === 0 &&
            pendingTrashJobCount === 0
        ) {
            return;
        }

        let cancelled = false;

        const pollPendingJobs = async (): Promise<void> => {
            try {
                const payload = await fetchNotifications(1);

                if (cancelled) {
                    return;
                }

                const pendingDuplicationJobIds =
                    pendingDuplicationJobIdsRef.current;
                const pendingZipJobIds = pendingZipJobIdsRef.current;
                const pendingTrashJobIds = pendingTrashJobIdsRef.current;
                let resolvedDuplication = false;
                let resolvedZip = false;
                let resolvedTrash = false;

                for (const notification of payload.data) {
                    const jobId = notification.data.job_id;

                    if (typeof jobId !== 'string') {
                        continue;
                    }

                    if (pendingDuplicationJobIds.has(jobId)) {
                        pendingDuplicationJobIds.delete(jobId);
                        resolvedDuplication = true;

                        if (
                            notification.data.type ===
                            'file_duplication_completed'
                        ) {
                            toast.success(
                                notification.data.title ??
                                    t('files.toasts.duplicationCompleted'),
                            );
                            refreshPage();
                        } else if (
                            notification.data.type === 'file_duplication_failed'
                        ) {
                            toast.error(
                                notification.data.title ??
                                    t('files.toasts.duplicationFailed'),
                            );
                        }
                    }

                    if (pendingTrashJobIds.has(jobId)) {
                        pendingTrashJobIds.delete(jobId);
                        resolvedTrash = true;

                        if (notification.data.type === 'files_trash_emptied') {
                            toast.success(t('files.toasts.trashEmptied'), {
                                description: notification.data.body,
                            });
                            refreshPage();
                        } else if (
                            notification.data.type ===
                            'files_trash_empty_failed'
                        ) {
                            toast.error(t('files.toasts.trashEmptyFailed'));
                        }
                    }

                    if (pendingZipJobIds.has(jobId)) {
                        pendingZipJobIds.delete(jobId);
                        resolvedZip = true;

                        if (notification.data.type === 'file_zip_ready') {
                            const downloadUrl =
                                typeof notification.data.download_url ===
                                'string'
                                    ? notification.data.download_url
                                    : downloadPreparedZipUrl(jobId);

                            toast.success(
                                notification.data.title ??
                                    t('files.toasts.zipReady'),
                                {
                                    action: {
                                        label: t('files.actions.download'),
                                        onClick: () => {
                                            window.location.href = downloadUrl;
                                        },
                                    },
                                },
                            );
                        } else if (
                            notification.data.type === 'file_zip_failed'
                        ) {
                            toast.error(
                                notification.data.title ??
                                    t('files.toasts.zipFailed'),
                            );
                        }
                    }
                }

                if (resolvedDuplication) {
                    setPendingDuplicationJobCount(
                        pendingDuplicationJobIds.size,
                    );
                }

                if (resolvedZip) {
                    setPendingZipJobCount(pendingZipJobIds.size);
                }

                if (resolvedTrash) {
                    setPendingTrashJobCount(pendingTrashJobIds.size);
                }

                if (resolvedDuplication || resolvedZip || resolvedTrash) {
                    notifyNotificationsUpdated();
                }
            } catch {
                // Ignore transient poll failures while jobs are pending.
            }
        };

        void pollPendingJobs();
        const intervalId = window.setInterval(() => {
            void pollPendingJobs();
        }, BACKGROUND_JOB_POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [
        pendingDuplicationJobCount,
        pendingZipJobCount,
        pendingTrashJobCount,
        refreshPage,
        t,
    ]);

    return {
        pendingTrashJobCount,
        trackPendingDuplication,
        trackPendingZip,
        trackPendingTrash,
    };
}

import { act, renderHook } from '@testing-library/react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import { useFilesBackgroundJobs } from './use-files-background-jobs';

const mocks = vi.hoisted(() => ({
    fetchNotifications: vi.fn(),
    notifyNotificationsUpdated: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/files-api', () => ({
    downloadPreparedZipUrl: (jobId: string) => `/zip/${jobId}`,
}));

vi.mock('@/lib/notifications-api', () => ({
    fetchNotifications: mocks.fetchNotifications,
    notifyNotificationsUpdated: mocks.notifyNotificationsUpdated,
}));

vi.mock('@/lib/toast', () => ({
    toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

function notifications(
    entries: { job_id: string; type: string; title?: string }[],
) {
    return { data: entries.map((data) => ({ data })) };
}

async function flushPoll(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

describe('useFilesBackgroundJobs', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mocks.fetchNotifications.mockReset();
        mocks.notifyNotificationsUpdated.mockReset();
        mocks.toastSuccess.mockReset();
        mocks.toastError.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not poll while no job is pending', () => {
        renderHook(() => useFilesBackgroundJobs(vi.fn()));

        act(() => {
            vi.advanceTimersByTime(10_000);
        });

        expect(mocks.fetchNotifications).not.toHaveBeenCalled();
    });

    it('refreshes the list when a duplication completes and stops polling', async () => {
        const refreshPage = vi.fn();
        mocks.fetchNotifications.mockResolvedValue(
            notifications([
                { job_id: 'dup-1', type: 'file_duplication_completed' },
            ]),
        );
        const { result } = renderHook(() =>
            useFilesBackgroundJobs(refreshPage),
        );

        act(() => {
            result.current.trackPendingDuplication('dup-1');
        });
        await flushPoll();

        expect(mocks.fetchNotifications).toHaveBeenCalledWith(1);
        expect(mocks.toastSuccess).toHaveBeenCalledWith(
            'files.toasts.duplicationCompleted',
        );
        expect(refreshPage).toHaveBeenCalledTimes(1);
        expect(mocks.notifyNotificationsUpdated).toHaveBeenCalledTimes(1);

        mocks.fetchNotifications.mockClear();

        act(() => {
            vi.advanceTimersByTime(10_000);
        });

        expect(mocks.fetchNotifications).not.toHaveBeenCalled();
    });

    it('offers the prepared ZIP for download when it is ready', async () => {
        mocks.fetchNotifications.mockResolvedValue(
            notifications([{ job_id: 'zip-1', type: 'file_zip_ready' }]),
        );
        const { result } = renderHook(() => useFilesBackgroundJobs(vi.fn()));

        act(() => {
            result.current.trackPendingZip('zip-1');
        });
        await flushPoll();

        expect(mocks.toastSuccess).toHaveBeenCalledWith(
            'files.toasts.zipReady',
            {
                action: {
                    label: 'files.actions.download',
                    onClick: expect.any(Function),
                },
            },
        );
    });

    it('keeps the trash job count until the job reports back', async () => {
        mocks.fetchNotifications.mockResolvedValue(notifications([]));
        const { result } = renderHook(() => useFilesBackgroundJobs(vi.fn()));

        act(() => {
            result.current.trackPendingTrash('trash-1');
        });
        await flushPoll();

        expect(result.current.pendingTrashJobCount).toBe(1);

        mocks.fetchNotifications.mockResolvedValue(
            notifications([
                { job_id: 'trash-1', type: 'files_trash_empty_failed' },
            ]),
        );

        await act(async () => {
            vi.advanceTimersByTime(2_500);
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(mocks.toastError).toHaveBeenCalledWith(
            'files.toasts.trashEmptyFailed',
        );
        expect(result.current.pendingTrashJobCount).toBe(0);
    });
});

import { act, renderHook } from '@testing-library/react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import type { AiImportJobStatus } from '@/lib/ai-chat';
import {
    importJobIdFromToolResult,
    useAiImportJobPoll,
} from './use-ai-import-job-poll';

const mocks = vi.hoisted(() => ({
    fetchAiImportJobStatus: vi.fn(),
}));

vi.mock('@/lib/ai-chat', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    fetchAiImportJobStatus: mocks.fetchAiImportJobStatus,
}));

function jobStatus(status: AiImportJobStatus['status']): AiImportJobStatus {
    return {
        job_id: 'job-1',
        status,
        processed: 1,
        total: 2,
        message: status,
    };
}

describe('importJobIdFromToolResult', () => {
    it('reads the job id from a JSON string or an object', () => {
        expect(importJobIdFromToolResult('{"job_id":"job-1"}')).toBe('job-1');
        expect(importJobIdFromToolResult({ job_id: 'job-2' })).toBe('job-2');
    });

    it('ignores results without a string job id', () => {
        expect(importJobIdFromToolResult('not json')).toBeNull();
        expect(importJobIdFromToolResult({ job_id: 3 })).toBeNull();
        expect(importJobIdFromToolResult(null)).toBeNull();
    });
});

describe('useAiImportJobPoll', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mocks.fetchAiImportJobStatus.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('polls until the job finishes', async () => {
        mocks.fetchAiImportJobStatus
            .mockResolvedValueOnce(jobStatus('running'))
            .mockResolvedValueOnce(jobStatus('done'));
        const { result } = renderHook(() => useAiImportJobPoll());

        await act(async () => {
            result.current.startImportPoll('job-1');
        });

        expect(result.current.importJobStatus?.status).toBe('running');

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });

        expect(result.current.importJobStatus?.status).toBe('done');

        await act(async () => {
            await vi.advanceTimersByTimeAsync(60000);
        });

        expect(mocks.fetchAiImportJobStatus).toHaveBeenCalledTimes(2);
        expect(mocks.fetchAiImportJobStatus).toHaveBeenCalledWith('job-1');
    });

    it('keeps the last status on a failed check and retries with backoff', async () => {
        mocks.fetchAiImportJobStatus
            .mockResolvedValueOnce(jobStatus('running'))
            .mockRejectedValueOnce(new Error('502'))
            .mockResolvedValueOnce(jobStatus('done'));
        const { result } = renderHook(() => useAiImportJobPoll());

        await act(async () => {
            result.current.startImportPoll('job-1');
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });

        expect(result.current.importJobStatus?.status).toBe('running');

        await act(async () => {
            await vi.advanceTimersByTimeAsync(4000);
        });

        expect(result.current.importJobStatus?.status).toBe('done');
        expect(mocks.fetchAiImportJobStatus).toHaveBeenCalledTimes(3);
    });

    it('stops polling on unmount', async () => {
        mocks.fetchAiImportJobStatus.mockResolvedValue(jobStatus('running'));
        const { result, unmount } = renderHook(() => useAiImportJobPoll());

        await act(async () => {
            result.current.startImportPoll('job-1');
        });

        unmount();

        await vi.advanceTimersByTimeAsync(10000);

        expect(mocks.fetchAiImportJobStatus).toHaveBeenCalledTimes(1);
    });
});

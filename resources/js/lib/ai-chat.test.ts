import { describe, expect, it } from 'vite-plus/test';
import { IMPORT_POLL_MAX_FAILURES, nextImportPollDelay } from '@/lib/ai-chat';

describe('nextImportPollDelay', () => {
    it('polls every 2 seconds while status checks succeed', () => {
        expect(nextImportPollDelay(0)).toBe(2000);
    });

    it('backs off exponentially after failed checks instead of stopping (#441)', () => {
        expect(
            [1, 2, 3, 4].map((failureCount) =>
                nextImportPollDelay(failureCount),
            ),
        ).toEqual([4000, 8000, 16000, 30000]);
    });

    it('stops polling after the maximum number of failed checks in a row', () => {
        expect(nextImportPollDelay(IMPORT_POLL_MAX_FAILURES)).toBeNull();
    });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announce, clearLiveAnnouncements } from '@/lib/live-announcer';

describe('announce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        clearLiveAnnouncements();
        vi.useRealTimers();
    });

    it('creates a polite live region and announces once', () => {
        announce('Saved successfully');
        vi.advanceTimersByTime(25);

        const region = document.getElementById('app-live-polite');
        expect(region).not.toBeNull();
        expect(region?.getAttribute('aria-live')).toBe('polite');
        expect(region?.textContent).toBe('Saved successfully');
    });

    it('uses an assertive region for errors', () => {
        announce('Delete failed', { politeness: 'assertive' });
        vi.advanceTimersByTime(25);

        const region = document.getElementById('app-live-assertive');
        expect(region?.getAttribute('aria-live')).toBe('assertive');
        expect(region?.textContent).toBe('Delete failed');
    });

    it('ignores blank messages', () => {
        announce('   ');
        vi.advanceTimersByTime(25);

        expect(document.getElementById('app-live-polite')).toBeNull();
    });
});

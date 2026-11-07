import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sonnerToast = Object.assign(vi.fn(), {
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
    loading: vi.fn(),
    custom: vi.fn(),
    getHistory: vi.fn(),
    getToasts: vi.fn(),
});

vi.mock('sonner', () => ({
    toast: sonnerToast,
}));

const announce = vi.fn();

vi.mock('@/lib/live-announcer', () => ({
    announce: (...args: unknown[]) => announce(...args),
}));

describe('toast wrapper', () => {
    beforeEach(() => {
        vi.resetModules();
        announce.mockClear();
        sonnerToast.error.mockClear();
        sonnerToast.success.mockClear();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('announces errors assertively and forwards to sonner', async () => {
        const { toast } = await import('@/lib/toast');

        toast.error('Save failed');

        expect(announce).toHaveBeenCalledWith('Save failed', {
            politeness: 'assertive',
        });
        expect(sonnerToast.error).toHaveBeenCalledWith(
            'Save failed',
            undefined,
        );
    });

    it('keeps action toasts open until dismissed', async () => {
        const { toast } = await import('@/lib/toast');
        const action = { label: 'Undo', onClick: vi.fn() };

        toast.success('Deleted', { action });

        expect(sonnerToast.success).toHaveBeenCalledWith('Deleted', {
            position: 'top-center',
            richColors: false,
            closeButton: true,
            action,
            duration: Infinity,
        });
    });

    it('shows success as a short top-centre message without close button', async () => {
        const { toast } = await import('@/lib/toast');

        toast.success('Saved');

        expect(sonnerToast.success).toHaveBeenCalledWith('Saved', {
            position: 'top-center',
            richColors: false,
            duration: 3000,
            closeButton: false,
        });
    });
});

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vite-plus/test';

// Vitest runs without globals here, so Testing Library cannot register its own
// automatic cleanup. Unmount every render after each test: hooks left mounted run
// their cleanup (network calls, timers) after jsdom is torn down and fail the run
// with "window is not defined".
afterEach(() => {
    cleanup();
});

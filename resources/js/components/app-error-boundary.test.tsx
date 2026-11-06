import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './app-error-boundary';

vi.mock('@/lib/i18n', () => ({
    default: { t: (key: string) => key },
}));

let shouldThrow = true;

function Crashing() {
    if (shouldThrow) {
        throw new Error('render failed');
    }

    return <p>Recovered</p>;
}

afterEach(() => {
    cleanup();
    shouldThrow = true;
});

describe('AppErrorBoundary', () => {
    it('shows the translated error state and recovers on Try again', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const user = userEvent.setup();

        render(
            <AppErrorBoundary>
                <Crashing />
            </AppErrorBoundary>,
        );

        expect(
            screen.getByRole('heading', { name: 'errors.boundary.title' }),
        ).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'errors.boundary.reload' }),
        ).toBeTruthy();

        shouldThrow = false;
        await user.click(
            screen.getByRole('button', { name: 'errors.boundary.tryAgain' }),
        );

        expect(screen.getByText('Recovered')).toBeTruthy();
    });
});

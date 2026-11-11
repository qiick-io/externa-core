import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { EmptyStatus } from '@/components/empty-status';

afterEach(() => {
    cleanup();
});

describe('EmptyStatus', () => {
    it('exposes a status live region without aria-hidden on the table', () => {
        render(
            <table>
                <tbody>
                    <tr>
                        <td>
                            <EmptyStatus>{'No collections yet.'}</EmptyStatus>
                        </td>
                    </tr>
                </tbody>
            </table>,
        );

        expect(screen.getByRole('status')).toHaveTextContent(
            'No collections yet.',
        );
        expect(screen.getByRole('table')).not.toHaveAttribute('aria-hidden');
    });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { UnsavedChangesDialog } from './unsaved-changes-dialog';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            const map: Record<string, string> = {
                'unsavedChanges.title': 'Unsaved changes',
                'unsavedChanges.description':
                    'You have unsaved changes. Are you sure you want to discard them?',
                'unsavedChanges.discard': 'Discard changes',
                'unsavedChanges.keepEditing': 'Keep editing',
            };

            return map[key] ?? key;
        },
    }),
}));

describe('UnsavedChangesDialog', () => {
    it('renders AlertDialog and maps actions to keep/discard', async () => {
        const user = userEvent.setup();
        const onKeepEditing = vi.fn();
        const onDiscard = vi.fn();

        render(
            <UnsavedChangesDialog
                open
                onKeepEditing={onKeepEditing}
                onDiscard={onDiscard}
            />,
        );

        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
        expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

        await user.click(
            screen.getByRole('button', { name: 'Discard changes' }),
        );
        expect(onDiscard).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole('button', { name: 'Keep editing' }));
        expect(onKeepEditing).toHaveBeenCalledTimes(1);
    });
});

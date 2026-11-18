import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ConfirmDestructiveDialog } from './confirm-destructive-dialog';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, string>) => {
            if (key === 'confirmDestructive.typeToConfirm') {
                return `Type "${options?.name ?? ''}" to confirm`;
            }

            if (key === 'common.cancel') {
                return 'Cancel';
            }

            if (key === 'common.delete') {
                return 'Delete';
            }

            return key;
        },
    }),
}));

afterEach(() => {
    cleanup();
});

describe('ConfirmDestructiveDialog', () => {
    it('renders AlertDialog content and keeps confirm enabled without typed confirmation', async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn();
        const onOpenChange = vi.fn();

        render(
            <ConfirmDestructiveDialog
                open
                onOpenChange={onOpenChange}
                title="Delete collection “Articles”?"
                description="This collection will be soft-deleted and moved to trash."
                onConfirm={onConfirm}
            />,
        );

        const dialog = screen.getByRole('alertdialog');
        expect(dialog).toBeInTheDocument();
        expect(
            within(dialog).getByText('Delete collection “Articles”?'),
        ).toBeInTheDocument();

        await user.click(
            within(dialog).getByRole('button', { name: 'Delete' }),
        );
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('disables force-delete until the typed collection name matches', async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn();

        render(
            <ConfirmDestructiveDialog
                open
                onOpenChange={() => undefined}
                title="Delete collection “Articles” permanently?"
                description="This collection will be permanently removed. This cannot be undone."
                typedConfirmation="Articles"
                confirmLabel="Delete permanently"
                onConfirm={onConfirm}
            />,
        );

        const dialog = screen.getByRole('alertdialog');
        const confirm = within(dialog).getByRole('button', {
            name: 'Delete permanently',
        });
        expect(confirm).toBeDisabled();

        await user.type(
            within(dialog).getByLabelText('Type "Articles" to confirm'),
            'Articles',
        );
        expect(confirm).toBeEnabled();

        await user.click(confirm);
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });
});

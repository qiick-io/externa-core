import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsFormActions } from './settings-form-actions';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) =>
            ({
                'a11y.saving': 'Saving',
                'common.saved': 'Saved.',
                'common.save': 'Save',
            })[key] ?? key,
    }),
}));

vi.mock('@/components/unsaved-changes-toolbar', () => ({
    UnsavedChangesToolbar: () => null,
}));

afterEach(() => {
    cleanup();
});

describe('SettingsFormActions', () => {
    it('announces saving through a busy status region (#254)', () => {
        render(<SettingsFormActions processing recentlySuccessful={false} />);

        const status = screen.getByRole('status');

        expect(status).toHaveAttribute('aria-live', 'polite');
        expect(status).toHaveAttribute('aria-busy', 'true');
        expect(status).toHaveTextContent('Saving');
        expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
            'aria-busy',
            'true',
        );
    });

    it('announces the saved confirmation in the same status region', () => {
        render(<SettingsFormActions processing={false} recentlySuccessful />);

        const status = screen.getByRole('status');

        expect(status).not.toHaveAttribute('aria-busy');
        expect(status).toHaveTextContent('Saved.');
    });
});

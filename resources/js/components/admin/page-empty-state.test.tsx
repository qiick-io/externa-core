import { cleanup, render, screen } from '@testing-library/react';
import { FolderOpen } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageEmptyState } from './page-empty-state';

afterEach(() => {
    cleanup();
});

describe('PageEmptyState', () => {
    it('renders icon title description and primary action', () => {
        render(
            <PageEmptyState
                icon={FolderOpen}
                title="No collections yet"
                description="Create one to get started."
                action={
                    <button type="button">
                        {'Create your first collection'}
                    </button>
                }
                docsHref="https://docs.externa.qiick.io"
                docsLabel="Learn more"
            />,
        );

        expect(screen.getByTestId('page-empty-state')).toBeInTheDocument();
        expect(screen.getByText('No collections yet')).toBeInTheDocument();
        expect(
            screen.getByText('Create one to get started.'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: 'Create your first collection',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /Learn more/i }),
        ).toHaveAttribute('href', 'https://docs.externa.qiick.io');
    });
});

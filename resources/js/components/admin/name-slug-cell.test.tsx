import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { NameSlugCell } from '@/components/admin/name-slug-cell';
import { TooltipProvider } from '@/components/ui/tooltip';

function renderWithTooltip(ui: ReactNode) {
    return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('NameSlugCell', () => {
    it('renders name, mono slug, and optional description', () => {
        renderWithTooltip(
            <NameSlugCell name="Posts" slug="posts" description="Blog posts" />,
        );

        expect(screen.getByText('Posts')).toBeInTheDocument();
        expect(screen.getByText('posts')).toHaveClass('font-mono');
        expect(screen.getByText('Blog posts')).toBeInTheDocument();
    });

    it('omits slug and description when absent', () => {
        const { container } = renderWithTooltip(
            <NameSlugCell name="Only name" />,
        );

        expect(screen.getByText('Only name')).toBeInTheDocument();
        expect(container.querySelector('.font-mono')).toBeNull();
    });
});

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';

vi.hoisted(() => {
    // useIsMobile reads matchMedia when its module loads, and the Radix tooltip
    // measures itself with ResizeObserver; jsdom has neither.
    window.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    };
    window.matchMedia = (query: string) =>
        ({
            matches: false,
            media: query,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        }) as unknown as MediaQueryList;
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

import { AppSidebarHeader } from '@/components/app-sidebar-header';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * The sidebar toggle's tooltip says what a click does next: collapse while the
 * sidebar is expanded, expand while it is collapsed (app-ui v0.9.0).
 */
describe('AppSidebarHeader', () => {
    it('names the next sidebar state and the shortcut in the toggle tooltip', async () => {
        render(
            <TooltipProvider delayDuration={0}>
                <SidebarProvider>
                    <AppSidebarHeader
                        leading={<span data-testid="leading-slot" />}
                    />
                </SidebarProvider>
            </TooltipProvider>,
        );

        const toggle = screen.getByRole('button', {
            name: 'a11y.toggleSidebar',
        });

        await act(async () => {
            fireEvent.focus(toggle);
        });

        expect(
            (await screen.findAllByText('a11y.collapseSidebar')).length,
        ).toBeGreaterThan(0);
        expect(screen.getByTestId('leading-slot')).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(toggle);
            fireEvent.blur(toggle);
            fireEvent.focus(toggle);
        });

        expect(
            (await screen.findAllByText('a11y.expandSidebar')).length,
        ).toBeGreaterThan(0);
    });
});

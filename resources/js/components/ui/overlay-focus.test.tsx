import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerTitle,
    DrawerTrigger,
} from '@/components/ui/drawer';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            if (key === 'a11y.close') {
                return 'Close';
            }

            return key;
        },
    }),
}));

beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
});

afterEach(() => {
    cleanup();
});

function SheetHarness() {
    return (
        <Sheet>
            <SheetTrigger asChild>
                <button type="button">Open sheet</button>
            </SheetTrigger>
            <SheetContent>
                <SheetTitle>Sheet title</SheetTitle>
                <SheetDescription>Sheet body</SheetDescription>
                <button type="button">Inside sheet</button>
            </SheetContent>
        </Sheet>
    );
}

function DrawerHarness() {
    return (
        <Drawer direction="right">
            <DrawerTrigger asChild>
                <button type="button">Open drawer</button>
            </DrawerTrigger>
            <DrawerContent>
                <DrawerTitle>Drawer title</DrawerTitle>
                <DrawerDescription>Drawer body</DrawerDescription>
                <button type="button">Inside drawer</button>
            </DrawerContent>
        </Drawer>
    );
}

function CustomPanelHarness() {
    const [open, setOpen] = useState(false);
    const panelRef = useRef<HTMLElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!open) {
            return;
        }

        previousFocusRef.current =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;

        const frame = window.requestAnimationFrame(() => {
            panelRef.current?.focus();
        });

        return () => {
            window.cancelAnimationFrame(frame);
            previousFocusRef.current?.focus();
        };
    }, [open]);

    return (
        <div>
            <button type="button" onClick={() => setOpen(true)}>
                Open panel
            </button>
            {open ? (
                <aside
                    ref={panelRef}
                    role="dialog"
                    aria-modal="false"
                    aria-label="File details"
                    tabIndex={-1}
                >
                    <h2>File details</h2>
                    <button type="button" onClick={() => setOpen(false)}>
                        Close panel
                    </button>
                </aside>
            ) : null}
        </div>
    );
}

describe('overlay focus management', () => {
    it('moves focus into a Sheet, traps Escape, and restores the trigger', async () => {
        const user = userEvent.setup();
        render(<SheetHarness />);

        const trigger = screen.getByRole('button', { name: 'Open sheet' });
        await user.click(trigger);

        const dialog = await screen.findByRole('dialog');
        expect(dialog).toBeInTheDocument();
        await waitFor(() => {
            expect(dialog.contains(document.activeElement)).toBe(true);
        });

        await user.keyboard('{Escape}');
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
        expect(trigger).toHaveFocus();
    });

    it('moves focus into a Drawer and restores the trigger on Escape', async () => {
        const user = userEvent.setup();
        render(<DrawerHarness />);

        const trigger = screen.getByRole('button', { name: 'Open drawer' });
        await user.click(trigger);

        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).getByRole('heading', { name: 'Drawer title' }),
        ).toBeInTheDocument();
        await waitFor(() => {
            expect(
                dialog.contains(document.activeElement) ||
                    document.activeElement === dialog,
            ).toBe(true);
        });

        await user.keyboard('{Escape}');
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
        expect(trigger).toHaveFocus();
    });

    it('focuses a custom panel on open and returns focus after close', async () => {
        const user = userEvent.setup();
        render(<CustomPanelHarness />);

        const trigger = screen.getByRole('button', { name: 'Open panel' });
        await user.click(trigger);

        const panel = await screen.findByRole('dialog', {
            name: 'File details',
        });
        await waitFor(() => {
            expect(panel).toHaveFocus();
        });

        await user.click(
            within(panel).getByRole('button', { name: 'Close panel' }),
        );
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
        expect(trigger).toHaveFocus();
    });

    it('moves focus into a Dialog and restores the trigger on Escape', async () => {
        const user = userEvent.setup();
        render(
            <Dialog>
                <DialogTrigger asChild>
                    <button type="button">Open dialog</button>
                </DialogTrigger>
                <DialogContent>
                    <DialogTitle>Dialog title</DialogTitle>
                    <DialogDescription>Dialog body</DialogDescription>
                </DialogContent>
            </Dialog>,
        );

        const trigger = screen.getByRole('button', { name: 'Open dialog' });
        await user.click(trigger);

        const dialog = await screen.findByRole('dialog');
        await waitFor(() => {
            expect(dialog.contains(document.activeElement)).toBe(true);
        });

        await user.keyboard('{Escape}');
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
        expect(trigger).toHaveFocus();
    });
});

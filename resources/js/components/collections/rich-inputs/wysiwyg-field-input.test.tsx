import Link from '@tiptap/extension-link';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WysiwygLinkPopover } from '@/components/collections/rich-inputs/wysiwyg-field-input';

// Radix/popover internals measure and observe in jsdom.
globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
};

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

afterEach(() => {
    cleanup();
});

function LinkPopoverHarness() {
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [StarterKit, Link.configure({ openOnClick: false })],
        content: '',
    });

    if (!editor) {
        return null;
    }

    return (
        <TooltipProvider>
            <WysiwygLinkPopover editor={editor} />
        </TooltipProvider>
    );
}

async function openLinkPopover() {
    const user = userEvent.setup();
    const linkButton = await screen.findByRole('button', {
        name: 'richText.link',
    });
    await user.click(linkButton);

    return screen.findByLabelText('richText.linkUrl');
}

describe('WysiwygLinkPopover', () => {
    it('does not apply the link on Enter while IME composition is open', async () => {
        render(<LinkPopoverHarness />);

        const urlInput = await openLinkPopover();
        fireEvent.change(urlInput, {
            target: { value: 'https://example.com' },
        });
        fireEvent.keyDown(urlInput, { key: 'Enter', isComposing: true });

        expect(screen.getByLabelText('richText.linkUrl')).toBeInTheDocument();
    });

    it('applies the link on Enter when IME composition is not open', async () => {
        render(<LinkPopoverHarness />);

        const urlInput = await openLinkPopover();
        fireEvent.change(urlInput, {
            target: { value: 'https://example.com' },
        });
        fireEvent.keyDown(urlInput, { key: 'Enter' });

        await waitFor(() => {
            expect(
                screen.queryByLabelText('richText.linkUrl'),
            ).not.toBeInTheDocument();
        });
    });
});

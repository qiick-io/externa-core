import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
    markdownHeadingCommands,
    useMarkdownShortcuts,
} from './use-markdown-shortcuts';

// The editor package imports CSS that the Node test runner cannot load.
const commands = vi.hoisted(() =>
    Object.fromEntries(
        [
            'bold',
            'italic',
            'link',
            'strikethrough',
            'quote',
            'code',
            'title1',
            'title2',
            'title3',
            'title4',
            'title5',
            'title6',
        ].map((name) => [name, { name }]),
    ),
);

vi.mock('@uiw/react-md-editor', () => ({ commands }));

function press(
    target: HTMLElement,
    key: string,
    modifiers: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean },
): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...modifiers,
    });
    target.dispatchEvent(event);

    return event;
}

describe('useMarkdownShortcuts', () => {
    const root = document.createElement('div');

    afterEach(() => {
        cleanup();
    });

    function renderShortcuts(
        readonly = false,
        tab: 'edit' | 'preview' = 'edit',
    ) {
        const runCommand = vi.fn();
        const rootRef = { current: root };
        renderHook(() =>
            useMarkdownShortcuts(rootRef, readonly, tab, runCommand),
        );

        return runCommand;
    }

    it('runs bold, italic and link on Cmd or Ctrl', () => {
        const runCommand = renderShortcuts();

        const bold = press(root, 'b', { metaKey: true });
        press(root, 'I', { ctrlKey: true });
        press(root, 'k', { metaKey: true });

        expect(bold.defaultPrevented).toBe(true);
        expect(runCommand.mock.calls.map(([command]) => command)).toEqual([
            commands.bold,
            commands.italic,
            commands.link,
        ]);
    });

    it('runs strikethrough, quote, code and headings with Alt', () => {
        const runCommand = renderShortcuts();

        press(root, 'd', { metaKey: true, altKey: true });
        press(root, 'q', { metaKey: true, altKey: true });
        press(root, 'c', { metaKey: true, altKey: true });
        press(root, '3', { metaKey: true, altKey: true });

        expect(runCommand.mock.calls.map(([command]) => command)).toEqual([
            commands.strikethrough,
            commands.quote,
            commands.code,
            markdownHeadingCommands[2],
        ]);
    });

    it('ignores keys without Cmd or Ctrl', () => {
        const editRun = renderShortcuts();
        const plain = press(root, 'b', {});
        expect(plain.defaultPrevented).toBe(false);
        expect(editRun).not.toHaveBeenCalled();
    });

    it('does not listen in preview or read-only mode', () => {
        const previewRun = renderShortcuts(false, 'preview');
        const readonlyRun = renderShortcuts(true, 'edit');

        press(root, 'b', { metaKey: true });

        expect(previewRun).not.toHaveBeenCalled();
        expect(readonlyRun).not.toHaveBeenCalled();
    });
});

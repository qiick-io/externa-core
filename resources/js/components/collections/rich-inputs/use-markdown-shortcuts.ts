import { commands } from '@uiw/react-md-editor';
import type { ICommand } from '@uiw/react-md-editor';
import { useEffect } from 'react';
import type { RefObject } from 'react';

export const markdownHeadingCommands: ICommand[] = [
    commands.title1,
    commands.title2,
    commands.title3,
    commands.title4,
    commands.title5,
    commands.title6,
];

/**
 * Keyboard shortcuts of the markdown field while it is in edit mode:
 * ⌘/Ctrl + B / I / K for bold, italic and link, and with ⌥ + D / Q / C / 1–6
 * for strikethrough, quote, code and headings. Listens on `rootRef` so the
 * shortcuts only apply inside this field.
 */
export function useMarkdownShortcuts(
    rootRef: RefObject<HTMLDivElement | null>,
    readonly: boolean,
    tab: 'edit' | 'preview',
    runCommand: (command: ICommand) => void,
): void {
    useEffect(() => {
        const root = rootRef.current;

        if (!root || readonly || tab !== 'edit') {
            return;
        }

        const onKeyDown = (event: KeyboardEvent): void => {
            const meta = event.metaKey || event.ctrlKey;

            if (!meta) {
                return;
            }

            const key = event.key.toLowerCase();

            if (key === 'b' && !event.altKey) {
                event.preventDefault();
                runCommand(commands.bold);

                return;
            }

            if (key === 'i' && !event.altKey) {
                event.preventDefault();
                runCommand(commands.italic);

                return;
            }

            if (key === 'k' && !event.altKey) {
                event.preventDefault();
                runCommand(commands.link);

                return;
            }

            if (!event.altKey) {
                return;
            }

            if (key === 'd') {
                event.preventDefault();
                runCommand(commands.strikethrough);

                return;
            }

            if (key === 'q') {
                event.preventDefault();
                runCommand(commands.quote);

                return;
            }

            if (key === 'c') {
                event.preventDefault();
                runCommand(commands.code);

                return;
            }

            const headingLevel = Number(key);

            if (headingLevel >= 1 && headingLevel <= 6) {
                event.preventDefault();
                runCommand(markdownHeadingCommands[headingLevel - 1]!);
            }
        };

        root.addEventListener('keydown', onKeyDown);

        return () => root.removeEventListener('keydown', onKeyDown);
        // rootRef is the caller's stable ref object; listing it never re-runs the effect.
    }, [readonly, rootRef, runCommand, tab]);
}

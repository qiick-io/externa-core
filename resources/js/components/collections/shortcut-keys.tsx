import { Kbd, KbdGroup } from '@/components/ui/kbd';

/**
 * A keyboard shortcut as shadcn Kbd caps, e.g. `['⌘', 'S']`.
 * @returns {JSX.Element}
 */
export function ShortcutKeys({ keys }: { keys: string[] }) {
    return (
        <KbdGroup>
            {keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
            ))}
        </KbdGroup>
    );
}

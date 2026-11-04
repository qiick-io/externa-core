import type { LucideIcon } from 'lucide-react';

/**
 * Header row of a chat hub's thread list (/chat and /ai): same h-16 as the
 * conversation pane header, so both bottom rules form one line.
 *
 * @param props.icon - Glyph for the list (collection, users, assistant)
 * @param props.title - List label
 * @param props.iconClassName - Optional icon tint (e.g. the AI accent)
 */
export function ChatHubListHeader({
    icon: Icon,
    title,
    iconClassName,
}: {
    icon: LucideIcon;
    title: string;
    iconClassName?: string;
}) {
    return (
        <div
            data-test="chat-hub-list-header"
            className="flex h-16 shrink-0 items-center gap-2 border-b px-4 text-sm font-medium"
        >
            <Icon
                className={iconClassName ?? 'size-4 text-muted-foreground'}
                aria-hidden
            />
            <span className="truncate">{title}</span>
        </div>
    );
}

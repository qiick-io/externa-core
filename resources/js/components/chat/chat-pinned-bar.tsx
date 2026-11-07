import { Pin } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Item,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemMedia,
    ItemTitle,
} from '@/components/ui/item';

type ChatPinnedBarRow = {
    id: number;
    author: string;
    body: ReactNode;
};

type ChatPinnedBarProps = {
    rows: ChatPinnedBarRow[];
    onSelect: (id: number) => void;
};

/**
 * The pinned messages above a chat thread, one shadcn `Item` each (muted, with
 * a pin), jumping to the message on click.
 */
export function ChatPinnedBar({ rows, onSelect }: ChatPinnedBarProps) {
    const { t } = useTranslation();

    if (rows.length === 0) {
        return null;
    }

    return (
        <ItemGroup
            aria-label={t('collections.itemChat.pinned')}
            className="gap-1"
            data-test="chat-pinned-bar"
        >
            {rows.map((row) => (
                <Item
                    key={row.id}
                    variant="muted"
                    size="sm"
                    className="w-full flex-nowrap gap-2 px-2 py-1.5 text-left"
                    asChild
                >
                    <button type="button" onClick={() => onSelect(row.id)}>
                        <ItemMedia>
                            <Pin className="size-3 text-muted-foreground" />
                        </ItemMedia>
                        <ItemContent className="min-w-0 flex-row items-baseline gap-1">
                            <ItemTitle className="shrink-0 text-xs">
                                {row.author}
                            </ItemTitle>
                            {row.body !== '' ? (
                                <ItemDescription className="line-clamp-1 text-xs">
                                    {row.body}
                                </ItemDescription>
                            ) : null}
                        </ItemContent>
                    </button>
                </Item>
            ))}
        </ItemGroup>
    );
}

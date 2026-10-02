import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { ItemPresenceUser } from '@/lib/item-presence';

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
        return '?';
    }

    if (parts.length === 1) {
        return parts[0]!.slice(0, 2).toUpperCase();
    }

    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

/**
 * Avatars + soft-lock take-over for other editors on the same item.
 */
export function ItemEditingPresence({
    editors,
    lockedByOther,
    lockHolderName,
    onTakeOver,
}: {
    editors: ItemPresenceUser[];
    lockedByOther: boolean;
    lockHolderName: string | null;
    onTakeOver: () => void;
}) {
    const { t } = useTranslation();

    if (editors.length === 0 && !lockedByOther) {
        return null;
    }

    return (
        <div
            className="flex max-w-md flex-wrap items-center gap-2 text-xs text-muted-foreground"
            data-test="item-editing-presence"
        >
            {editors.length > 0 ? (
                <div className="flex items-center gap-1.5">
                    <div className="flex -space-x-2">
                        {editors.slice(0, 4).map((editor) => (
                            <Avatar
                                key={editor.id}
                                userId={editor.id}
                                className="size-7 border-2 border-background"
                            >
                                <AvatarFallback className="text-[10px]">
                                    {initials(
                                        editor.name ?? `User ${editor.id}`,
                                    )}
                                </AvatarFallback>
                            </Avatar>
                        ))}
                    </div>
                    <span>
                        {t('collections.itemPresence.viewing', {
                            count: editors.length,
                        })}
                    </span>
                </div>
            ) : null}
            {lockedByOther && lockHolderName ? (
                <div className="flex items-center gap-2">
                    <span
                        className="text-amber-700 dark:text-amber-400"
                        data-test="item-presence-soft-lock"
                    >
                        {t('collections.itemPresence.lockedBy', {
                            name: lockHolderName,
                        })}
                    </span>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2"
                        data-test="item-presence-take-over"
                        onClick={onTakeOver}
                    >
                        {t('collections.itemPresence.takeOver')}
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { avatarToneClass } from '@/lib/avatar-tone';
import { initialsFromName } from '@/lib/format';
import type { ItemPresenceUser } from '@/lib/item-presence';
import { cn } from '@/lib/utils';

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
                <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                        {editors.slice(0, 4).map((editor) => (
                            <Avatar
                                key={editor.id}
                                className="size-7 border-2 border-background"
                            >
                                <AvatarFallback
                                    className={cn(
                                        avatarToneClass(editor.id),
                                        'text-xs',
                                    )}
                                >
                                    {initialsFromName(
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
                        className="text-warning-text"
                        data-test="item-presence-soft-lock"
                    >
                        {t('collections.itemPresence.lockedBy', {
                            name: lockHolderName,
                        })}
                    </span>
                    <Button
                        type="button"
                        variant="outline"
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

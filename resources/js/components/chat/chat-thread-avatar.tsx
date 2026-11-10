import { UsersRound } from 'lucide-react';
import { LucideIconByName } from '@/components/collections/field-settings/lucide-icon-picker';
import {
    Avatar,
    AvatarFallback,
    AvatarGroup,
    AvatarGroupCount,
} from '@/components/ui/avatar';
import { avatarToneClass } from '@/lib/avatar-tone';
import {
    chatAvatarStackPlan,
    initialsFromName,
    otherUserFaces,
} from '@/lib/chat-thread-identity';
import type {
    ChatParticipantRef,
    ChatThreadIdentity,
} from '@/lib/chat-thread-identity';
import { contrastingForeground } from '@/lib/color-contrast';
import { cn } from '@/lib/utils';

function FaceCircle({
    face,
    className,
}: {
    face: ChatParticipantRef;
    className?: string;
}) {
    return (
        <Avatar className={className}>
            <AvatarFallback
                className={cn(avatarToneClass(face.id), 'text-xs font-medium')}
            >
                {initialsFromName(face.name)}
            </AvatarFallback>
        </Avatar>
    );
}

function StackedFaces({ faces }: { faces: ChatParticipantRef[] }) {
    const { shown, overflow } = chatAvatarStackPlan(faces.length);
    const visible = faces.slice(0, shown);

    return (
        <AvatarGroup
            className="shrink-0 *:data-[slot=avatar]:ring-card"
            aria-hidden
        >
            {visible.map((face) => (
                <FaceCircle
                    key={`${face.type}-${face.id}`}
                    face={face}
                    className="size-7"
                />
            ))}
            {overflow > 0 ? (
                <AvatarGroupCount className="size-7 text-xs font-medium ring-card">
                    +{overflow}
                </AvatarGroupCount>
            ) : null}
        </AvatarGroup>
    );
}

/**
 * List-row / open-thread avatar: collection mark, 1:1 initials, or stacked faces.
 */
export function ChatThreadAvatar({
    thread,
    viewerId,
}: {
    thread: ChatThreadIdentity;
    viewerId: number;
}) {
    if (thread.kind === 'item') {
        const color = thread.collection_color || undefined;
        const letter =
            (thread.collection_name ?? thread.title)
                .trim()
                .charAt(0)
                .toUpperCase() || '?';
        // The collection's own colour setting wins; otherwise a theme avatar tone.
        const style = color
            ? {
                  backgroundColor: color,
                  color: contrastingForeground(color) ?? undefined,
              }
            : undefined;

        return (
            <span
                className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-medium',
                    !color &&
                        avatarToneClass(thread.collection_id ?? thread.id),
                )}
                style={style}
                aria-hidden
            >
                {thread.collection_icon ? (
                    <LucideIconByName
                        name={thread.collection_icon}
                        className="size-5"
                        fallbackToDefault
                    />
                ) : (
                    letter
                )}
            </span>
        );
    }

    const others = otherUserFaces(thread.participants, viewerId);

    if (others.length === 0) {
        return (
            <span
                className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-full',
                    avatarToneClass(thread.id),
                )}
                aria-hidden
            >
                <UsersRound className="size-5" />
            </span>
        );
    }

    if (others.length === 1) {
        const other = others[0]!;

        return (
            <Avatar className="size-10">
                <AvatarFallback
                    className={cn(
                        avatarToneClass(other.id),
                        'text-sm font-medium',
                    )}
                >
                    {initialsFromName(other.name)}
                </AvatarFallback>
            </Avatar>
        );
    }

    return <StackedFaces faces={others} />;
}

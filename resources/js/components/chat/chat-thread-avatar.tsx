import { UsersRound } from 'lucide-react';
import { LucideIconByName } from '@/components/collections/field-settings/lucide-icon-picker';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { avatarStyleForId, avatarTextColor } from '@/lib/avatar-color';
import {
    chatAvatarStackPlan,
    initialsFromName,
    otherUserFaces,
} from '@/lib/chat-thread-identity';
import type {
    ChatParticipantRef,
    ChatThreadIdentity,
} from '@/lib/chat-thread-identity';
import { cn } from '@/lib/utils';

function FaceCircle({
    face,
    className,
}: {
    face: ChatParticipantRef;
    className?: string;
}) {
    return (
        <Avatar userId={face.id} className={className}>
            <AvatarFallback className="text-[10px] font-medium">
                {initialsFromName(face.name)}
            </AvatarFallback>
        </Avatar>
    );
}

function StackedFaces({ faces }: { faces: ChatParticipantRef[] }) {
    const { shown, overflow } = chatAvatarStackPlan(faces.length);
    const visible = faces.slice(0, shown);

    return (
        <span className="flex shrink-0 items-center" aria-hidden>
            {visible.map((face, index) => (
                <FaceCircle
                    key={`${face.type}-${face.id}`}
                    face={face}
                    className={cn(
                        'size-7 ring-2 ring-card',
                        index > 0 && '-ml-2',
                    )}
                />
            ))}
            {overflow > 0 ? (
                <span className="relative -ml-2 flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-card">
                    +{overflow}
                </span>
            ) : null}
        </span>
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
        const style = color
            ? { backgroundColor: color, color: avatarTextColor(color) }
            : avatarStyleForId(thread.collection_id ?? thread.id);

        return (
            <span
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-medium"
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
        const style = avatarStyleForId(thread.id);

        return (
            <span
                className="flex size-10 shrink-0 items-center justify-center rounded-full"
                style={style}
                aria-hidden
            >
                <UsersRound className="size-5" />
            </span>
        );
    }

    if (others.length === 1) {
        const other = others[0]!;

        return (
            <Avatar userId={other.id} className="size-10">
                <AvatarFallback className="text-sm font-medium">
                    {initialsFromName(other.name)}
                </AvatarFallback>
            </Avatar>
        );
    }

    return <StackedFaces faces={others} />;
}

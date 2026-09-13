export type ReactionActor = {
    id: number;
    name: string;
};

export type ReactionRow = {
    emoji: string;
    count: number;
    reacted: boolean;
    users: ReactionActor[];
};

export function applyReactionToggle(
    reactions: ReactionRow[],
    emoji: string,
    added: boolean,
    actor: ReactionActor,
    isOwn: boolean,
): ReactionRow[] {
    const next = reactions.map((row) => ({
        ...row,
        users: [...(row.users ?? [])],
    }));
    const index = next.findIndex((row) => row.emoji === emoji);

    if (added) {
        if (index === -1) {
            next.push({
                emoji,
                count: 1,
                reacted: isOwn,
                users: [actor],
            });
        } else {
            const users = next[index]!.users.filter(
                (user) => user.id !== actor.id,
            );
            users.push(actor);
            next[index] = {
                ...next[index]!,
                users,
                count: users.length,
                reacted: isOwn ? true : next[index]!.reacted,
            };
        }

        return next;
    }

    if (index === -1) {
        return next;
    }

    const users = next[index]!.users.filter((user) => user.id !== actor.id);

    if (users.length === 0) {
        next.splice(index, 1);
    } else {
        next[index] = {
            ...next[index]!,
            users,
            count: users.length,
            reacted: isOwn ? false : next[index]!.reacted,
        };
    }

    return next;
}

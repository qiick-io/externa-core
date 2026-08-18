import { router } from '@inertiajs/react';
import { Database, Plus, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Drawer,
    DrawerBody,
    DrawerContent,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { getInitialsFromParts } from '@/hooks/use-initials';
import {
    createChatThread,
    fetchChatDirectory,
    fetchChatItemPicker,
} from '@/lib/chat-hub-api';
import type {
    ChatDirectoryRow,
    ChatItemPickerGroup,
    ChatListMeta,
} from '@/lib/chat-hub-api';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

type Props = {
    canCreateDirect: boolean;
};

function directoryKey(row: ChatDirectoryRow): string {
    return `${row.type}:${row.id}`;
}

function directoryInitials(row: ChatDirectoryRow): string {
    if (row.type === 'user') {
        const fromParts = getInitialsFromParts(row.first_name, row.last_name);

        return fromParts !== '' ? fromParts : row.name.slice(0, 2).toUpperCase();
    }

    const parts = row.name.trim().split(/\s+/).filter(Boolean);

    if (parts.length >= 2) {
        return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
    }

    return row.name.slice(0, 2).toUpperCase();
}

function avatarSeed(row: ChatDirectoryRow): string {
    return row.type === 'user' ? String(row.id) : `group-${row.id}`;
}

export function NewChatMenu({ canCreateDirect }: Props) {
    const { t } = useTranslation();
    const [usersOpen, setUsersOpen] = useState(false);
    const [itemsOpen, setItemsOpen] = useState(false);

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" data-test="chat-new">
                        <Plus className="size-4" />
                        {t('chatHub.new')}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {canCreateDirect ? (
                        <DropdownMenuItem
                            data-test="chat-new-users"
                            onSelect={() => setUsersOpen(true)}
                        >
                            <UsersRound className="size-4" />
                            {t('chatHub.users')}
                        </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                        data-test="chat-new-collections"
                        onSelect={() => setItemsOpen(true)}
                    >
                        <Database className="size-4" />
                        {t('chatHub.collections')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <UsersDrawer open={usersOpen} onOpenChange={setUsersOpen} />
            <ItemsDrawer open={itemsOpen} onOpenChange={setItemsOpen} />
        </>
    );
}

function UsersDrawer({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { t } = useTranslation();
    const [q, setQ] = useState('');
    const [rows, setRows] = useState<ChatDirectoryRow[]>([]);
    const [meta, setMeta] = useState<ChatListMeta | null>(null);
    const [picked, setPicked] = useState<ChatDirectoryRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const loadPage = useCallback(
        (page: number, append: boolean, query: string): void => {
            if (append) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }

            void fetchChatDirectory(query, page)
                .then((payload) => {
                    setRows((prev) =>
                        append ? [...prev, ...payload.data] : payload.data,
                    );
                    setMeta(payload.meta);
                })
                .catch((error: unknown) => {
                    toast.error(
                        error instanceof Error
                            ? error.message
                            : t('chatHub.emptyDirectory'),
                    );
                })
                .finally(() => {
                    setLoading(false);
                    setLoadingMore(false);
                });
        },
        [t],
    );

    useEffect(() => {
        if (open) {
            return;
        }

        setQ('');
        setRows([]);
        setMeta(null);
        setPicked([]);
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const timer = window.setTimeout(() => loadPage(1, false, q), 200);

        return () => window.clearTimeout(timer);
    }, [open, q, loadPage]);

    const toggle = (row: ChatDirectoryRow): void => {
        const key = directoryKey(row);
        setPicked((prev) => {
            if (prev.some((item) => directoryKey(item) === key)) {
                return prev.filter((item) => directoryKey(item) !== key);
            }

            return [...prev, row];
        });
    };

    const confirm = (): void => {
        if (picked.length === 0 || submitting) {
            return;
        }

        setSubmitting(true);
        void createChatThread({
            kind: 'direct',
            user_ids: picked
                .filter((row) => row.type === 'user')
                .map((row) => row.id),
            group_ids: picked
                .filter((row) => row.type === 'group')
                .map((row) => row.id),
        })
            .then((chat) => {
                onOpenChange(false);
                router.visit(`/chat/${chat.id}`);
            })
            .catch((error: unknown) => {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : t('chatHub.create'),
                );
            })
            .finally(() => setSubmitting(false));
    };

    return (
        <Drawer
            open={open}
            onOpenChange={onOpenChange}
            direction="right"
        >
            <DrawerContent data-test="chat-new-users-drawer">
                <DrawerHeader>
                    <DrawerTitle>{t('chatHub.users')}</DrawerTitle>
                    <Input
                        data-test="chat-directory-q"
                        value={q}
                        placeholder={t('chatHub.searchDirectory')}
                        onChange={(event) => setQ(event.target.value)}
                    />
                </DrawerHeader>
                <DrawerBody>
                    {loading ? (
                        <p className="text-sm text-muted-foreground">
                            {t('chatHub.loading')}
                        </p>
                    ) : null}
                    {!loading && rows.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {t('chatHub.emptyDirectory')}
                        </p>
                    ) : null}
                    <ul className="space-y-0.5">
                        {rows.map((row) => {
                            const selected = picked.some(
                                (item) => directoryKey(item) === directoryKey(row),
                            );

                            return (
                                <li key={directoryKey(row)}>
                                    <label
                                        data-test={`chat-directory-row-${row.type}-${row.id}`}
                                        className={cn(
                                            'flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted',
                                            selected && 'bg-muted',
                                        )}
                                        onClick={(event) => {
                                            event.preventDefault();
                                            toggle(row);
                                        }}
                                    >
                                        <Checkbox
                                            checked={selected}
                                            className="pointer-events-none"
                                            aria-label={row.name}
                                        />
                                        <Avatar
                                            userId={avatarSeed(row)}
                                            className="size-9"
                                        >
                                            <AvatarFallback className="text-xs font-medium">
                                                {directoryInitials(row)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-medium">
                                                {row.name}
                                            </span>
                                            {row.type === 'user' ? (
                                                <span className="block truncate text-xs text-muted-foreground">
                                                    {row.email}
                                                </span>
                                            ) : (
                                                <span className="block text-xs text-muted-foreground">
                                                    {t('chatHub.groups')}
                                                </span>
                                            )}
                                        </span>
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                    {meta?.has_more ? (
                        <Button
                            type="button"
                            variant="outline"
                            className="mt-3 w-full"
                            disabled={loading || loadingMore}
                            onClick={() =>
                                loadPage(
                                    (meta.current_page ?? 1) + 1,
                                    true,
                                    q,
                                )
                            }
                        >
                            {loadingMore
                                ? t('chatHub.loading')
                                : t('chatHub.loadMore')}
                        </Button>
                    ) : null}
                </DrawerBody>
                <DrawerFooter>
                    <Button
                        type="button"
                        data-test="chat-directory-create"
                        disabled={picked.length === 0 || submitting}
                        onClick={confirm}
                    >
                        {picked.length > 0
                            ? t('chatHub.selectedCount', {
                                  count: picked.length,
                              })
                            : t('chatHub.create')}
                    </Button>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}

function ItemsDrawer({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { t } = useTranslation();
    const [q, setQ] = useState('');
    const [groups, setGroups] = useState<ChatItemPickerGroup[]>([]);
    const [meta, setMeta] = useState<ChatListMeta | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [creatingId, setCreatingId] = useState<number | null>(null);

    const loadPage = useCallback(
        (page: number, append: boolean, query: string): void => {
            if (append) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }

            void fetchChatItemPicker(query, page)
                .then((payload) => {
                    setGroups((prev) =>
                        append ? [...prev, ...payload.data] : payload.data,
                    );
                    setMeta(payload.meta);
                })
                .catch((error: unknown) => {
                    toast.error(
                        error instanceof Error
                            ? error.message
                            : t('chatHub.emptyItems'),
                    );
                })
                .finally(() => {
                    setLoading(false);
                    setLoadingMore(false);
                });
        },
        [t],
    );

    useEffect(() => {
        if (open) {
            return;
        }

        setQ('');
        setGroups([]);
        setMeta(null);
        setCreatingId(null);
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const timer = window.setTimeout(() => loadPage(1, false, q), 200);

        return () => window.clearTimeout(timer);
    }, [open, q, loadPage]);

    const pickItem = (collectionId: number, itemId: number): void => {
        if (creatingId !== null) {
            return;
        }

        setCreatingId(itemId);
        void createChatThread({
            kind: 'item',
            collection_id: collectionId,
            item_id: itemId,
        })
            .then((chat) => {
                onOpenChange(false);
                router.visit(`/chat/${chat.id}`);
            })
            .catch((error: unknown) => {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : t('chatHub.create'),
                );
            })
            .finally(() => setCreatingId(null));
    };

    return (
        <Drawer
            open={open}
            onOpenChange={onOpenChange}
            direction="right"
        >
            <DrawerContent data-test="chat-new-items-drawer">
                <DrawerHeader>
                    <DrawerTitle>{t('chatHub.collections')}</DrawerTitle>
                    <Input
                        data-test="chat-item-picker-q"
                        value={q}
                        placeholder={t('chatHub.searchItems')}
                        onChange={(event) => setQ(event.target.value)}
                    />
                </DrawerHeader>
                <DrawerBody>
                    {loading ? (
                        <p className="text-sm text-muted-foreground">
                            {t('chatHub.loading')}
                        </p>
                    ) : null}
                    {!loading && groups.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {t('chatHub.emptyItems')}
                        </p>
                    ) : null}
                    {groups.map((collection) => (
                        <section key={collection.id} className="mb-2">
                            <div className="sticky top-0 z-10 -mx-6 border-b bg-background px-6 py-2 text-xs font-medium text-muted-foreground">
                                {collection.name}
                            </div>
                            <ul>
                                {collection.items.map((item) => (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            data-test={`chat-item-row-${item.id}`}
                                            disabled={creatingId !== null}
                                            className="flex w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                                            onClick={() =>
                                                pickItem(collection.id, item.id)
                                            }
                                        >
                                            {item.label}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                    {meta?.has_more ? (
                        <Button
                            type="button"
                            variant="outline"
                            className="mt-3 w-full"
                            disabled={loading || loadingMore}
                            onClick={() =>
                                loadPage(
                                    (meta.current_page ?? 1) + 1,
                                    true,
                                    q,
                                )
                            }
                        >
                            {loadingMore
                                ? t('chatHub.loading')
                                : t('chatHub.loadMore')}
                        </Button>
                    ) : null}
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    );
}

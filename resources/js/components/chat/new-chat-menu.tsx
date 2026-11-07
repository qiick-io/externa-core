import { router } from '@inertiajs/react';
import { Database, Plus, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatUsersDrawer } from '@/components/chat/chat-users-drawer';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createChatThread, fetchChatItemPicker } from '@/lib/chat-hub-api';
import type { ChatItemPickerGroup, ChatListMeta } from '@/lib/chat-hub-api';
import { toast } from '@/lib/toast';

type Props = {
    canCreateDirect: boolean;
};

export function NewChatMenu({ canCreateDirect }: Props) {
    const { t } = useTranslation();
    const [usersOpen, setUsersOpen] = useState(false);
    const [itemsOpen, setItemsOpen] = useState(false);

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button data-test="chat-new">
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

            <ChatUsersDrawer
                open={usersOpen}
                onOpenChange={setUsersOpen}
                onConfirm={async (picked) => {
                    await createChatThread({
                        kind: 'direct',
                        user_ids: picked
                            .filter((row) => row.type === 'user')
                            .map((row) => row.id),
                        group_ids: picked
                            .filter((row) => row.type === 'group')
                            .map((row) => row.id),
                    }).then((chat) => {
                        router.visit(`/chat/${chat.id}`);
                    });
                }}
            />
            <ItemsDrawer open={itemsOpen} onOpenChange={setItemsOpen} />
        </>
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
        <Drawer open={open} onOpenChange={onOpenChange} direction="right">
            <DrawerContent data-test="chat-new-items-drawer">
                <DrawerHeader>
                    <DrawerTitle>{t('chatHub.collections')}</DrawerTitle>
                </DrawerHeader>
                <Command
                    shouldFilter={false}
                    className="min-h-0 flex-1 rounded-none bg-transparent"
                >
                    <CommandInput
                        data-test="chat-item-picker-q"
                        value={q}
                        placeholder={t('chatHub.searchItems')}
                        aria-label={t('chatHub.searchItems')}
                        onValueChange={setQ}
                    />
                    <CommandList
                        label={t('chatHub.collections')}
                        className="max-h-none flex-1 px-3 py-2"
                    >
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
                            <CommandGroup
                                key={collection.id}
                                heading={collection.name}
                            >
                                {collection.items.map((item) => (
                                    <CommandItem
                                        key={item.id}
                                        value={`${collection.id}-${item.id}`}
                                        data-test={`chat-item-row-${item.id}`}
                                        disabled={creatingId !== null}
                                        className="py-2"
                                        onSelect={() =>
                                            pickItem(collection.id, item.id)
                                        }
                                    >
                                        {item.label}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
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
                    </CommandList>
                </Command>
            </DrawerContent>
        </Drawer>
    );
}

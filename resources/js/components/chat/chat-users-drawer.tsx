import { UsersRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyStatus } from '@/components/empty-status';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Command,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Drawer,
    DrawerContent,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
} from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { avatarToneClass } from '@/lib/avatar-tone';
import { fetchChatDirectory } from '@/lib/chat-hub-api';
import type { ChatDirectoryRow, ChatListMeta } from '@/lib/chat-hub-api';
import { formatUserDisplayName, initialsFromName } from '@/lib/format';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

export function directoryKey(row: { type: string; id: number }): string {
    return `${row.type}:${row.id}`;
}

function directoryInitials(row: ChatDirectoryRow): string {
    if (row.type === 'user') {
        return initialsFromName(
            formatUserDisplayName(row.first_name, row.last_name) || row.name,
        );
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

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (picked: ChatDirectoryRow[]) => Promise<void> | void;
    excludeKeys?: string[];
    title?: string;
    confirmLabel?: string;
};

export function ChatUsersDrawer({
    open,
    onOpenChange,
    onConfirm,
    excludeKeys = [],
    title,
    confirmLabel,
}: Props) {
    const { t } = useTranslation();
    const [q, setQ] = useState('');
    const [rows, setRows] = useState<ChatDirectoryRow[]>([]);
    const [meta, setMeta] = useState<ChatListMeta | null>(null);
    const [picked, setPicked] = useState<ChatDirectoryRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const excluded = new Set(excludeKeys);

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
        void Promise.resolve(onConfirm(picked))
            .then(() => onOpenChange(false))
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
        <Drawer open={open} onOpenChange={onOpenChange} direction="right">
            <DrawerContent data-test="chat-users-drawer">
                <DrawerHeader>
                    <DrawerTitle>{title ?? t('chatHub.users')}</DrawerTitle>
                </DrawerHeader>
                <Command
                    shouldFilter={false}
                    className="min-h-0 flex-1 rounded-none bg-transparent"
                >
                    <CommandInput
                        data-test="chat-directory-q"
                        value={q}
                        placeholder={t('chatHub.searchDirectory')}
                        aria-label={t('chatHub.searchDirectory')}
                        onValueChange={setQ}
                    />
                    <CommandList
                        label={title ?? t('chatHub.users')}
                        className="max-h-none flex-1 px-3 py-2"
                    >
                        {loading ? (
                            <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
                                <Spinner className="size-5" />
                                {t('chatHub.loading')}
                            </div>
                        ) : null}
                        {!loading && rows.length === 0 ? (
                            <Empty className="gap-3 p-6 md:p-6">
                                <EmptyHeader>
                                    <EmptyMedia
                                        variant="icon"
                                        className="bg-primary/10 text-primary"
                                    >
                                        <UsersRound />
                                    </EmptyMedia>
                                    <EmptyDescription>
                                        <EmptyStatus>
                                            {t('chatHub.emptyDirectory')}
                                        </EmptyStatus>
                                    </EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        ) : null}
                        {rows.map((row) => {
                            const key = directoryKey(row);
                            const alreadyIn = excluded.has(key);
                            const selected = picked.some(
                                (item) => directoryKey(item) === key,
                            );

                            return (
                                <CommandItem
                                    key={key}
                                    value={key}
                                    disabled={alreadyIn}
                                    data-test={`chat-directory-row-${row.type}-${row.id}`}
                                    data-checked={selected || alreadyIn}
                                    className="gap-3 py-2"
                                    onSelect={() => toggle(row)}
                                >
                                    <Checkbox
                                        checked={selected || alreadyIn}
                                        disabled={alreadyIn}
                                        tabIndex={-1}
                                        aria-hidden
                                        className="pointer-events-none"
                                    />
                                    <Avatar className="size-9">
                                        <AvatarFallback
                                            className={cn(
                                                avatarToneClass(
                                                    avatarSeed(row),
                                                ),
                                                'text-xs font-medium',
                                            )}
                                        >
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
                                </CommandItem>
                            );
                        })}
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
                                {loadingMore ? <Spinner /> : null}
                                {t('chatHub.loadMore')}
                            </Button>
                        ) : null}
                    </CommandList>
                </Command>
                <DrawerFooter>
                    <Button
                        type="button"
                        data-test="chat-directory-confirm"
                        disabled={picked.length === 0 || submitting}
                        onClick={confirm}
                    >
                        {confirmLabel ??
                            (picked.length > 0
                                ? t('chatHub.selectedCount', {
                                      count: picked.length,
                                  })
                                : t('chatHub.create'))}
                    </Button>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}

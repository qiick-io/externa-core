import { ChevronRight, FolderOpen } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { listFilesPage } from '@/lib/files-api';
import { cn } from '@/lib/utils';
import type { AdminFileRow, FileBreadcrumb } from '@/types/files';

type BlockedFolder = Pick<AdminFileRow, 'id' | 'path'>;

type FolderPickerDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title?: string;
    description?: string;
    confirmLabel?: string;
    /** Folders being moved — cannot be selected or entered (covers descendants via path). */
    blockedFolders?: BlockedFolder[];
    onConfirm: (parentId: number | null) => Promise<void>;
};

function isBlockedFolder(
    folder: Pick<AdminFileRow, 'id' | 'path'>,
    blockedFolders: BlockedFolder[],
): boolean {
    return blockedFolders.some((blocked) => {
        if (folder.id === blocked.id) {
            return true;
        }

        const blockedPath = blocked.path.replace(/\/$/, '');

        return (
            folder.path === blockedPath ||
            folder.path.startsWith(`${blockedPath}/`)
        );
    });
}

/**
 * Modal tree for choosing a destination folder.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function FolderPickerDialog({
    open,
    onOpenChange,
    title = 'Move to folder',
    description = 'Choose a destination folder for the selected items.',
    confirmLabel = 'Move here',
    blockedFolders = [],
    onConfirm,
}: FolderPickerDialogProps) {
    const [browseParentId, setBrowseParentId] = useState<number | null>(null);
    const [breadcrumbs, setBreadcrumbs] = useState<FileBreadcrumb[]>([]);
    const [folders, setFolders] = useState<AdminFileRow[]>([]);
    const [page, setPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const blockedFolderIds = useMemo(
        () => new Set(blockedFolders.map((folder) => folder.id)),
        [blockedFolders],
    );

    const locationIsBlocked =
        browseParentId !== null && blockedFolderIds.has(browseParentId);

    const loadFolders = useCallback(
        async (options: { page: number; append: boolean }) => {
            setLoading(true);
            setError(null);

            try {
                const result = await listFilesPage({
                    parentId: browseParentId,
                    page: options.page,
                    search: search.trim() || undefined,
                });

                const nextFolders = result.data.filter(
                    (file) =>
                        file.type === 'folder' &&
                        !isBlockedFolder(file, blockedFolders),
                );

                setFolders((current) =>
                    options.append ? [...current, ...nextFolders] : nextFolders,
                );
                setPage(result.current_page);
                setLastPage(result.last_page);
            } catch (loadError) {
                setError(
                    loadError instanceof Error
                        ? loadError.message
                        : 'Failed to load folders',
                );
            } finally {
                setLoading(false);
            }
        },
        [blockedFolders, browseParentId, search],
    );

    useEffect(() => {
        if (!open) {
            return;
        }

        const timer = setTimeout(
            () => {
                void loadFolders({ page: 1, append: false });
            },
            search.trim() ? 300 : 0,
        );

        return () => clearTimeout(timer);
    }, [open, loadFolders, search]);

    useEffect(() => {
        if (!open) {
            setBrowseParentId(null);
            setBreadcrumbs([]);
            setFolders([]);
            setPage(1);
            setLastPage(1);
            setSearch('');
            setError(null);
            setSubmitting(false);
        }
    }, [open]);

    const openFolder = (folder: AdminFileRow): void => {
        if (isBlockedFolder(folder, blockedFolders)) {
            return;
        }

        setBrowseParentId(folder.id);
        setBreadcrumbs((previous) => [
            ...previous,
            { id: folder.id, name: folder.name },
        ]);
        setSearch('');
    };

    const navigateTo = (index: number): void => {
        if (index < 0) {
            setBrowseParentId(null);
            setBreadcrumbs([]);
            setSearch('');

            return;
        }

        const target = breadcrumbs[index];
        setBrowseParentId(target.id);
        setBreadcrumbs(breadcrumbs.slice(0, index + 1));
        setSearch('');
    };

    const submit = async (): Promise<void> => {
        if (locationIsBlocked) {
            setError('Cannot move into a selected folder or its descendants.');

            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            await onConfirm(browseParentId);
            onOpenChange(false);
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : 'Failed to move items',
            );
        } finally {
            setSubmitting(false);
        }
    };

    const destinationLabel =
        browseParentId === null
            ? 'Root'
            : (breadcrumbs[breadcrumbs.length - 1]?.name ?? 'Folder');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-lg"
                data-testid="folder-picker-dialog"
            >
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <div className="grid gap-3">
                    <Input
                        placeholder="Search folders…"
                        value={search}
                        disabled={submitting}
                        onChange={(event) => setSearch(event.target.value)}
                        data-testid="folder-picker-search"
                    />

                    <nav
                        className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm"
                        aria-label="Folder breadcrumbs"
                    >
                        <button
                            type="button"
                            className="hover:text-foreground"
                            disabled={submitting}
                            onClick={() => navigateTo(-1)}
                        >
                            Root
                        </button>
                        {breadcrumbs.map((crumb, index) => (
                            <span
                                key={crumb.id}
                                className="flex items-center gap-1"
                            >
                                <ChevronRight className="size-3.5" />
                                <button
                                    type="button"
                                    className="hover:text-foreground"
                                    disabled={submitting}
                                    onClick={() => navigateTo(index)}
                                >
                                    {crumb.name}
                                </button>
                            </span>
                        ))}
                    </nav>

                    <div className="border-sidebar-border/70 max-h-72 min-h-40 overflow-y-auto rounded-lg border">
                        {loading && folders.length === 0 ? (
                            <p className="text-muted-foreground p-3 text-sm">
                                Loading…
                            </p>
                        ) : null}
                        {!loading && folders.length === 0 ? (
                            <p className="text-muted-foreground p-3 text-sm">
                                No folders here
                            </p>
                        ) : null}
                        <ul className="divide-sidebar-border/70 divide-y">
                            {folders.map((folder) => (
                                <li key={folder.id}>
                                    <button
                                        type="button"
                                        className={cn(
                                            'hover:bg-muted/60 flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                                        )}
                                        disabled={submitting}
                                        onClick={() => openFolder(folder)}
                                        data-testid={`folder-picker-item-${folder.id}`}
                                    >
                                        <FolderOpen className="size-4 shrink-0 text-amber-500" />
                                        <span className="truncate font-medium">
                                            {folder.name}
                                        </span>
                                        <ChevronRight className="text-muted-foreground ml-auto size-4 shrink-0" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                        {page < lastPage ? (
                            <div className="border-sidebar-border/70 border-t p-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="w-full"
                                    disabled={loading || submitting}
                                    onClick={() =>
                                        void loadFolders({
                                            page: page + 1,
                                            append: true,
                                        })
                                    }
                                >
                                    {loading ? 'Loading…' : 'Load more'}
                                </Button>
                            </div>
                        ) : null}
                    </div>

                    <p className="text-muted-foreground text-sm">
                        Destination:{' '}
                        <span className="text-foreground font-medium">
                            {destinationLabel}
                        </span>
                    </p>

                    {error ? (
                        <p className="text-destructive text-sm">{error}</p>
                    ) : null}
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={submitting}
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={submitting || locationIsBlocked}
                        onClick={() => void submit()}
                        data-testid="folder-picker-confirm"
                    >
                        {submitting ? 'Moving…' : confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

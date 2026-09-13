import { ChevronRight, FolderOpen } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
    title,
    description,
    confirmLabel,
    blockedFolders = [],
    onConfirm,
}: FolderPickerDialogProps) {
    const { t } = useTranslation();
    const [browseParentId, setBrowseParentId] = useState<number | null>(null);
    const [breadcrumbs, setBreadcrumbs] = useState<FileBreadcrumb[]>([]);
    const [folders, setFolders] = useState<AdminFileRow[]>([]);
    const [page, setPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const resolvedTitle = title ?? t('files.dialogs.moveTitle');
    const resolvedDescription =
        description ?? t('files.dialogs.moveDescription');
    const resolvedConfirmLabel = confirmLabel ?? t('files.dialogs.moveHere');

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
                        : t('files.folderPicker.failedLoad'),
                );
            } finally {
                setLoading(false);
            }
        },
        [blockedFolders, browseParentId, search, t],
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
            setError(t('files.folderPicker.cannotMoveIntoSelected'));

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
                    : t('files.folderPicker.failedMove'),
            );
        } finally {
            setSubmitting(false);
        }
    };

    const destinationLabel =
        browseParentId === null
            ? t('files.root')
            : (breadcrumbs[breadcrumbs.length - 1]?.name ?? t('files.folder'));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-lg"
                data-testid="folder-picker-dialog"
            >
                <DialogHeader>
                    <DialogTitle>{resolvedTitle}</DialogTitle>
                    <DialogDescription>{resolvedDescription}</DialogDescription>
                </DialogHeader>

                <div className="grid gap-3">
                    <Input
                        placeholder={t('files.folderPicker.search')}
                        value={search}
                        disabled={submitting}
                        onChange={(event) => setSearch(event.target.value)}
                        data-testid="folder-picker-search"
                    />

                    <nav
                        className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
                        aria-label={t('files.folderPicker.breadcrumbs')}
                    >
                        <button
                            type="button"
                            className="hover:text-foreground"
                            disabled={submitting}
                            onClick={() => navigateTo(-1)}
                        >
                            {t('files.root')}
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

                    <div className="max-h-72 min-h-40 overflow-y-auto rounded-lg border border-sidebar-border/70">
                        {loading && folders.length === 0 ? (
                            <p className="p-3 text-sm text-muted-foreground">
                                {t('files.loading')}
                            </p>
                        ) : null}
                        {!loading && folders.length === 0 ? (
                            <p className="p-3 text-sm text-muted-foreground">
                                {t('files.folderPicker.empty')}
                            </p>
                        ) : null}
                        <ul className="divide-y divide-sidebar-border/70">
                            {folders.map((folder) => (
                                <li key={folder.id}>
                                    <button
                                        type="button"
                                        className={cn(
                                            'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60',
                                        )}
                                        disabled={submitting}
                                        onClick={() => openFolder(folder)}
                                        data-testid={`folder-picker-item-${folder.id}`}
                                    >
                                        <FolderOpen className="size-4 shrink-0 text-amber-500" />
                                        <span className="truncate font-medium">
                                            {folder.name}
                                        </span>
                                        <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                        {page < lastPage ? (
                            <div className="border-t border-sidebar-border/70 p-2">
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
                                    {loading
                                        ? t('files.loading')
                                        : t('files.loadMore')}
                                </Button>
                            </div>
                        ) : null}
                    </div>

                    <p className="text-sm text-muted-foreground">
                        {t('files.folderPicker.destination')}{' '}
                        <span className="font-medium text-foreground">
                            {destinationLabel}
                        </span>
                    </p>

                    {error ? (
                        <p className="text-sm text-destructive">{error}</p>
                    ) : null}
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={submitting}
                        onClick={() => onOpenChange(false)}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        type="button"
                        disabled={submitting || locationIsBlocked}
                        onClick={() => void submit()}
                        data-testid="folder-picker-confirm"
                    >
                        {submitting
                            ? t('files.dialogs.moving')
                            : resolvedConfirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

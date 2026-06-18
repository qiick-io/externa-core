import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    deleteFile,
    filePublicUrl,
    forceDeleteFile,
    formatFileSize,
    isImageFile,
    renameFile,
    restoreFile,
} from '@/lib/files-api';
import type { AdminFileRow } from '@/types/files';

type FileFormDrawerProps = {
    file: AdminFileRow | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpdated: () => void;
    canEdit?: boolean;
    canDelete?: boolean;
    canRestore?: boolean;
    canForceDelete?: boolean;
    isTrashed?: boolean;
};

export function FileFormDrawer({
    file,
    open,
    onOpenChange,
    onUpdated,
    canEdit = true,
    canDelete = true,
    canRestore = false,
    canForceDelete = false,
    isTrashed = false,
}: FileFormDrawerProps) {
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [forceDeleting, setForceDeleting] = useState(false);

    useEffect(() => {
        setName(file?.name ?? '');
    }, [file]);

    if (!file) {
        return null;
    }

    const publicUrl = filePublicUrl(file);

    const save = async (): Promise<void> => {
        if (!canEdit || name.trim() === '' || name === file.name) {
            return;
        }

        setSaving(true);
        try {
            await renameFile(file.id, name.trim());
            onUpdated();
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    };

    const destroy = async (): Promise<void> => {
        if (!canDelete) {
            return;
        }

        setDeleting(true);
        try {
            await deleteFile(file.id);
            onUpdated();
            onOpenChange(false);
        } finally {
            setDeleting(false);
        }
    };

    const restore = async (): Promise<void> => {
        if (!canRestore) {
            return;
        }

        setRestoring(true);
        try {
            await restoreFile(file.id);
            onUpdated();
            onOpenChange(false);
        } finally {
            setRestoring(false);
        }
    };

    const forceDelete = async (): Promise<void> => {
        if (!canForceDelete) {
            return;
        }

        setForceDeleting(true);
        try {
            await forceDeleteFile(file.id);
            onUpdated();
            onOpenChange(false);
        } finally {
            setForceDeleting(false);
        }
    };

    return (
        <Drawer open={open} onOpenChange={onOpenChange} direction="right">
            <DrawerContent>
                <DrawerHeader>
                    <DrawerTitle>{file.name}</DrawerTitle>
                    <DrawerDescription>
                        {isTrashed ? 'Deleted file' : file.path}
                    </DrawerDescription>
                </DrawerHeader>

                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                    {publicUrl && isImageFile(file) && (
                        <img
                            src={publicUrl}
                            alt={file.name}
                            className="max-h-48 w-full rounded-lg border object-contain"
                        />
                    )}

                    {!isTrashed && (
                        <div className="grid gap-2">
                            <Label htmlFor="file-name">Name</Label>
                            <Input
                                id="file-name"
                                value={name}
                                disabled={!canEdit}
                                onChange={(event) => setName(event.target.value)}
                            />
                        </div>
                    )}

                    <dl className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <dt className="text-muted-foreground">Type</dt>
                            <dd className="font-medium capitalize">
                                {file.type}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Size</dt>
                            <dd className="font-medium">
                                {formatFileSize(file.size)}
                            </dd>
                        </div>
                        {file.mime_type && (
                            <div className="col-span-2">
                                <dt className="text-muted-foreground">MIME</dt>
                                <dd className="font-medium">{file.mime_type}</dd>
                            </div>
                        )}
                        {file.width && file.height && (
                            <div className="col-span-2">
                                <dt className="text-muted-foreground">
                                    Dimensions
                                </dt>
                                <dd className="font-medium">
                                    {file.width} × {file.height}
                                </dd>
                            </div>
                        )}
                        {file.deleted_at && (
                            <div className="col-span-2">
                                <dt className="text-muted-foreground">
                                    Deleted at
                                </dt>
                                <dd className="font-medium">
                                    {new Date(file.deleted_at).toLocaleString()}
                                </dd>
                            </div>
                        )}
                    </dl>
                </div>

                <DrawerFooter>
                    {canEdit && !isTrashed && (
                        <Button
                            type="button"
                            disabled={saving || name.trim() === ''}
                            onClick={() => void save()}
                        >
                            {saving ? 'Saving…' : 'Save name'}
                        </Button>
                    )}
                    {canDelete && !isTrashed && (
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={deleting}
                            onClick={() => void destroy()}
                        >
                            {deleting ? 'Deleting…' : 'Delete'}
                        </Button>
                    )}
                    {canRestore && isTrashed && (
                        <Button
                            type="button"
                            disabled={restoring}
                            onClick={() => void restore()}
                        >
                            {restoring ? 'Restoring…' : 'Restore'}
                        </Button>
                    )}
                    {canForceDelete && isTrashed && (
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={forceDeleting}
                            onClick={() => void forceDelete()}
                        >
                            {forceDeleting
                                ? 'Deleting…'
                                : 'Delete permanently'}
                        </Button>
                    )}
                    <DrawerClose asChild>
                        <Button type="button" variant="outline">
                            Close
                        </Button>
                    </DrawerClose>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}

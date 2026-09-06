import { FileDetailPanel } from '@/components/admin/files/file-detail-panel';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from '@/components/ui/sheet';
import type { AdminFileRow, FileTag } from '@/types/files';

type FileDetailDrawerProps = {
    file: AdminFileRow | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    canUpdateMetadata: boolean;
    canTag: boolean;
    canReplace: boolean;
    tagCatalog: FileTag[];
    onUpdated: (file: AdminFileRow) => void;
};

/**
 * Overlay drawer wrapping FileDetailPanel for use outside the file manager layout.
 */
export function FileDetailDrawer({
    file,
    open,
    onOpenChange,
    canUpdateMetadata,
    canTag,
    canReplace,
    tagCatalog,
    onUpdated,
}: FileDetailDrawerProps) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="w-full gap-0 p-0 sm:max-w-[380px] [&>button]:hidden"
            >
                <SheetTitle className="sr-only">File details</SheetTitle>
                <SheetDescription className="sr-only">
                    Edit file metadata, tags, and replace the file contents.
                </SheetDescription>
                {file ? (
                    <FileDetailPanel
                        file={file}
                        presentation="sheet"
                        canUpdateMetadata={canUpdateMetadata}
                        canTag={canTag}
                        canReplace={canReplace}
                        tagCatalog={tagCatalog}
                        onClose={() => onOpenChange(false)}
                        onUpdated={onUpdated}
                    />
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

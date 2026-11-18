import {
    ChevronDown,
    FolderOpen,
    FolderPlus,
    Trash2,
    Upload,
} from 'lucide-react';
import type { ChangeEvent, InputHTMLAttributes, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { Button } from '@/components/ui/button';
import {
    ButtonGroup,
    ButtonGroupSeparator,
} from '@/components/ui/button-group';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type FilesHeaderActionsProps = {
    isTrashed: boolean;
    canForceDelete: boolean;
    canCreate: boolean;
    uploadsEnabled: boolean;
    isEmptyTrashDisabled: boolean;
    fileInputRef: RefObject<HTMLInputElement | null>;
    folderInputRef: RefObject<HTMLInputElement | null>;
    onEmptyTrash: () => void;
    onNewFolder: () => void;
    onUploadInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

/**
 * File manager header actions: "Empty trash" in the trash view, otherwise
 * "New folder" and the upload split button (file or folder) with the hidden
 * file inputs it opens.
 */
export function FilesHeaderActions({
    isTrashed,
    canForceDelete,
    canCreate,
    uploadsEnabled,
    isEmptyTrashDisabled,
    fileInputRef,
    folderInputRef,
    onEmptyTrash,
    onNewFolder,
    onUploadInputChange,
}: FilesHeaderActionsProps) {
    const { t } = useTranslation();

    return (
        <>
            {isTrashed && canForceDelete && (
                <Button
                    type="button"
                    variant="destructive"
                    disabled={isEmptyTrashDisabled}
                    onClick={onEmptyTrash}
                    data-testid="files-empty-trash"
                >
                    <Trash2 className="size-4" />
                    {t('files.toolbar.emptyTrash')}
                </Button>
            )}
            {canCreate && !isTrashed && (
                <HeaderIconButton
                    type="button"
                    variant="outline"
                    label={t('files.toolbar.newFolder')}
                    onClick={onNewFolder}
                >
                    <FolderPlus className="size-4" />
                </HeaderIconButton>
            )}
            {uploadsEnabled && (
                <>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={onUploadInputChange}
                    />
                    <input
                        ref={folderInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        {...({
                            webkitdirectory: '',
                        } as InputHTMLAttributes<HTMLInputElement>)}
                        onChange={onUploadInputChange}
                    />
                    <ButtonGroup>
                        <Button
                            type="button"
                            data-test="files-upload"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload />
                            {t('files.toolbar.upload')}
                        </Button>
                        <ButtonGroupSeparator />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    type="button"
                                    size="icon"
                                    data-test="files-upload-menu"
                                    aria-label={t(
                                        'files.toolbar.uploadOptions',
                                    )}
                                >
                                    <ChevronDown />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    onClick={() =>
                                        fileInputRef.current?.click()
                                    }
                                >
                                    <Upload className="size-4" />
                                    {t('files.toolbar.uploadFile')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() =>
                                        folderInputRef.current?.click()
                                    }
                                >
                                    <FolderOpen className="size-4" />
                                    {t('files.toolbar.uploadFolder')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </ButtonGroup>
                </>
            )}
        </>
    );
}

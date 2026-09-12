import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FilesActionsOverflow } from '@/components/admin/files/files-actions-overflow';
import { Button } from '@/components/ui/button';
import type { FileActionDefinition, FileActionKey } from '@/types/files';

type FilesSelectionToolbarProps = {
    count: number;
    actions: FileActionDefinition[];
    onClear: () => void;
    onAction: (key: FileActionKey) => void;
};

/**
 * Toolbar shown when one or more files are selected.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function FilesSelectionToolbar({
    count,
    actions,
    onClear,
    onAction,
}: FilesSelectionToolbarProps) {
    const { t } = useTranslation();

    return (
        <div className="flex min-w-0 items-center gap-3">
            <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-medium">
                    {t('files.toolbar.selectedCount', { count })}
                </span>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={onClear}
                    aria-label={t('files.toolbar.clearSelection')}
                    data-testid="files-clear-selection"
                >
                    <X className="size-4" />
                </Button>
            </div>
            <FilesActionsOverflow actions={actions} onAction={onAction} />
        </div>
    );
}

import { Sparkles, X } from 'lucide-react';
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
    // Pin Ask AI like collections bulk toolbar — overflow alone hid the CTA from browser tests + users.
    const askAi = actions.find((action) => action.key === 'ask_ai');
    const overflowActions = actions.filter((action) => action.key !== 'ask_ai');

    return (
        <div className="flex min-w-0 items-center gap-3">
            <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-medium">
                    {t('files.toolbar.selectedCount', { count })}
                </span>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={onClear}
                    aria-label={t('files.toolbar.clearSelection')}
                    data-testid="files-clear-selection"
                >
                    <X className="size-4" />
                </Button>
            </div>
            {askAi ? (
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => onAction('ask_ai')}
                >
                    <Sparkles className="size-4" />
                    {askAi.label}
                </Button>
            ) : null}
            {overflowActions.length > 0 ? (
                <FilesActionsOverflow
                    actions={overflowActions}
                    onAction={onAction}
                />
            ) : null}
        </div>
    );
}

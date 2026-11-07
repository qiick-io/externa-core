import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FilesActionsOverflow } from '@/components/admin/files/files-actions-overflow';
import { AskAiButton } from '@/components/ai/ask-ai-button';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { FileActionDefinition, FileActionKey } from '@/types/files';

type FilesSelectionToolbarProps = {
    count: number;
    /** Files currently loaded in the grid (the select-all scope). */
    visibleCount: number;
    actions: FileActionDefinition[];
    onSelectAll: () => void;
    onClear: () => void;
    onAction: (key: FileActionKey) => void;
};

/**
 * Selection bar shown when one or more files are selected: select-all
 * checkbox (visible files), count and clear on the left; icon actions on the
 * right, the same layout as the table bulk bar.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function FilesSelectionToolbar({
    count,
    visibleCount,
    actions,
    onSelectAll,
    onClear,
    onAction,
}: FilesSelectionToolbarProps) {
    const { t } = useTranslation();
    // Pin Ask AI like collections bulk toolbar — overflow alone hid the CTA from browser tests + users.
    const askAi = actions.find((action) => action.key === 'ask_ai');
    const overflowActions = actions.filter((action) => action.key !== 'ask_ai');
    const allSelected = visibleCount > 0 && count >= visibleCount;

    return (
        <div className="flex w-full min-w-0 items-center justify-between gap-3">
            <div className="flex shrink-0 items-center gap-2">
                <Checkbox
                    checked={allSelected ? true : 'indeterminate'}
                    onCheckedChange={() =>
                        allSelected ? onClear() : onSelectAll()
                    }
                    aria-label={t('a11y.selectAll')}
                    data-testid="files-select-all"
                />
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
            {/* flex-1: the overflow measures this slot, so it must span the free width, not its content. */}
            <FilesActionsOverflow
                actions={overflowActions}
                onAction={onAction}
                className="justify-end"
                pinned={
                    askAi ? (
                        <AskAiButton
                            mode="toolbar"
                            label={askAi.label}
                            onAsk={() => onAction('ask_ai')}
                        />
                    ) : null
                }
            />
        </div>
    );
}

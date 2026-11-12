import { ArrowDownAZ, ArrowUpAZ, Files, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
    FileSortDirection,
    FileSortField,
    FilesTrashedView,
} from '@/components/admin/files/use-files-filters';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const FILE_SORT_FIELDS: { value: FileSortField; labelKey: string }[] = [
    { value: 'name', labelKey: 'files.sort.name' },
    { value: 'size', labelKey: 'files.sort.size' },
    { value: 'created_at', labelKey: 'files.sort.created' },
    { value: 'updated_at', labelKey: 'files.sort.updated' },
];

type FilesSortControlsProps = {
    sort: FileSortField;
    direction: FileSortDirection;
    trashed: FilesTrashedView;
    onSortChange: (
        nextSort: FileSortField,
        nextDirection: FileSortDirection,
    ) => void;
    onTrashedChange: (nextTrashed: FilesTrashedView) => void;
};

/**
 * Right-hand list controls of the file manager: sort field, sort direction
 * and the active files / trash switch.
 */
export function FilesSortControls({
    sort,
    direction,
    trashed,
    onSortChange,
    onTrashedChange,
}: FilesSortControlsProps) {
    const { t } = useTranslation();

    return (
        <div className="flex items-center gap-2">
            <Select
                value={sort}
                onValueChange={(value) => {
                    if (
                        value === 'name' ||
                        value === 'size' ||
                        value === 'created_at' ||
                        value === 'updated_at'
                    ) {
                        onSortChange(value, direction);
                    }
                }}
            >
                <SelectTrigger
                    aria-label={t('files.toolbar.sortBy')}
                    className="w-[7.5rem]"
                >
                    <SelectValue placeholder={t('files.toolbar.sort')} />
                </SelectTrigger>
                <SelectContent align="end">
                    {FILE_SORT_FIELDS.map((field) => (
                        <SelectItem key={field.value} value={field.value}>
                            {t(field.labelKey)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={
                    direction === 'asc'
                        ? t('files.toolbar.sortAsc')
                        : t('files.toolbar.sortDesc')
                }
                onClick={() => {
                    onSortChange(sort, direction === 'asc' ? 'desc' : 'asc');
                }}
            >
                {direction === 'asc' ? (
                    <ArrowUpAZ className="size-4" />
                ) : (
                    <ArrowDownAZ className="size-4" />
                )}
            </Button>
            <ToggleGroup
                variant="outline"
                type="single"
                value={trashed}
                onValueChange={(value) => {
                    if (value === 'active' || value === 'trashed') {
                        onTrashedChange(value);
                    }
                }}
            >
                <ToggleGroupItem
                    value="active"
                    aria-label={t('files.toolbar.activeFiles')}
                >
                    <Files className="size-4" />
                </ToggleGroupItem>
                <ToggleGroupItem
                    value="trashed"
                    aria-label={t('files.toolbar.trash')}
                >
                    <Trash2 className="size-4" />
                </ToggleGroupItem>
            </ToggleGroup>
        </div>
    );
}

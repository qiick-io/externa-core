import {
    CalendarDays,
    Columns3,
    FolderOpen,
    LayoutList,
    Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { getFieldDisplayName } from '@/lib/collection-field-types';
import type { CollectionFieldRow } from '@/types';
import type { ListLayout } from './items-index-helpers';

type ItemsLayoutControlsProps = {
    listLayout: ListLayout;
    setLayout: (layout: ListLayout) => void;
    kanbanFields: CollectionFieldRow[];
    kanbanField: string | null;
    onKanbanFieldChange: (fieldName: string) => void;
    calendarFields: CollectionFieldRow[];
    calendarField: string | null;
    onCalendarFieldChange: (fieldName: string) => void;
    isTrashed: boolean;
    onTrashedChange: (trashed: boolean) => void;
};

/**
 * Right side of the items list toolbar: layout picker (table / kanban /
 * calendar), the kanban or calendar field and the active / trash toggle.
 */
export function ItemsLayoutControls({
    listLayout,
    setLayout,
    kanbanFields,
    kanbanField,
    onKanbanFieldChange,
    calendarFields,
    calendarField,
    onCalendarFieldChange,
    isTrashed,
    onTrashedChange,
}: ItemsLayoutControlsProps) {
    const { t } = useTranslation();

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Select
                value={listLayout}
                onValueChange={(value) => {
                    if (
                        value === 'table' ||
                        value === 'kanban' ||
                        value === 'calendar'
                    ) {
                        setLayout(value);
                    }
                }}
            >
                <SelectTrigger
                    className="w-auto min-w-28"
                    data-test="list-layout-select"
                    aria-label={t('collections.itemsList.layout')}
                >
                    <SelectValue
                        placeholder={t('collections.itemsList.layout')}
                    />
                </SelectTrigger>
                <SelectContent align="end">
                    <SelectItem
                        value="table"
                        textValue={t('collections.itemsList.layoutTable')}
                    >
                        <LayoutList className="size-4" />
                        {t('collections.itemsList.layoutTable')}
                    </SelectItem>
                    <SelectItem
                        value="kanban"
                        textValue={t('collections.itemsList.layoutKanban')}
                        disabled={kanbanFields.length === 0}
                    >
                        <Columns3 className="size-4" />
                        {t('collections.itemsList.layoutKanban')}
                    </SelectItem>
                    <SelectItem
                        value="calendar"
                        textValue={t('collections.itemsList.layoutCalendar')}
                        disabled={calendarFields.length === 0}
                    >
                        <CalendarDays className="size-4" />
                        {t('collections.itemsList.layoutCalendar')}
                    </SelectItem>
                </SelectContent>
            </Select>
            {listLayout === 'kanban' && kanbanFields.length > 0 ? (
                <Select
                    value={kanbanField ?? undefined}
                    onValueChange={onKanbanFieldChange}
                >
                    <SelectTrigger
                        className="w-auto min-w-36"
                        data-test="kanban-field-select"
                        aria-label={t('collections.itemsList.kanbanField')}
                    >
                        {kanbanField ? (
                            <span className="text-muted-foreground">
                                {t('collections.itemsList.kanbanField')}:
                            </span>
                        ) : null}
                        <SelectValue
                            placeholder={t('collections.itemsList.kanbanField')}
                        />
                    </SelectTrigger>
                    <SelectContent>
                        {kanbanFields.map((field) => {
                            const label = getFieldDisplayName(
                                field.settings,
                                field.name,
                            );

                            return (
                                <SelectItem
                                    key={field.id}
                                    value={field.name}
                                    textValue={label}
                                >
                                    {label}
                                </SelectItem>
                            );
                        })}
                    </SelectContent>
                </Select>
            ) : null}
            {listLayout === 'calendar' && calendarFields.length > 0 ? (
                <Select
                    value={calendarField ?? undefined}
                    onValueChange={onCalendarFieldChange}
                >
                    <SelectTrigger
                        className="w-auto min-w-36"
                        data-test="calendar-field-select"
                        aria-label={t('collections.itemsList.calendarField')}
                    >
                        {calendarField ? (
                            <span className="text-muted-foreground">
                                {t('collections.itemsList.calendarField')}:
                            </span>
                        ) : null}
                        <SelectValue
                            placeholder={t(
                                'collections.itemsList.calendarField',
                            )}
                        />
                    </SelectTrigger>
                    <SelectContent>
                        {calendarFields.map((field) => {
                            const label = getFieldDisplayName(
                                field.settings,
                                field.name,
                            );

                            return (
                                <SelectItem
                                    key={field.id}
                                    value={field.name}
                                    textValue={label}
                                >
                                    {label}
                                </SelectItem>
                            );
                        })}
                    </SelectContent>
                </Select>
            ) : null}
            <ToggleGroup
                variant="outline"
                type="single"
                value={isTrashed ? 'trashed' : 'active'}
                onValueChange={(value) => {
                    if (!value) {
                        return;
                    }

                    onTrashedChange(value === 'trashed');
                }}
            >
                <ToggleGroupItem
                    value="active"
                    aria-label={t('collections.itemsList.activeItems')}
                >
                    <FolderOpen className="size-4" />
                </ToggleGroupItem>
                <ToggleGroupItem
                    value="trashed"
                    aria-label={t('collections.itemsList.trash')}
                >
                    <Trash2 className="size-4" />
                </ToggleGroupItem>
            </ToggleGroup>
        </div>
    );
}

import { Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { getFieldDisplayName } from '@/lib/collection-field-types';
import { STRING_LIMITS } from '@/lib/string-limits';
import type { CollectionFieldRow } from '@/types';

export type RelatedFieldEntry = {
    name: string;
    display_name: string;
    type: string;
};

type ColumnPickerPopoverProps = {
    fields: CollectionFieldRow[];
    listColumns: string[];
    relatedFieldsCatalog: Record<string, RelatedFieldEntry[]>;
    onChange: (columns: string[]) => void;
};

/** System columns with their i18n key under `collections.columnPicker`. */
const SYSTEM_FIELDS: Array<{ name: string; labelKey: string }> = [
    { name: 'id', labelKey: 'id' },
    { name: 'created_at', labelKey: 'createdAt' },
    { name: 'updated_at', labelKey: 'updatedAt' },
    { name: 'user_created', labelKey: 'createdBy' },
    { name: 'user_updated', labelKey: 'updatedBy' },
];

function isDrillable(type: string): boolean {
    return [
        'many_to_one',
        'one_to_many',
        'many_to_many',
        'image',
        'files',
    ].includes(type);
}

/**
 * Column picker on Popover + Command: search, toggle a column (checked items
 * show a check), drill down one level into a relation / file field from the
 * "Related fields" group. cmdk filters by label and by field path.
 * @returns {JSX.Element}
 */
export function ColumnPickerPopover({
    fields,
    listColumns,
    relatedFieldsCatalog,
    onChange,
}: ColumnPickerPopoverProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [drillField, setDrillField] = useState<CollectionFieldRow | null>(
        null,
    );

    const visible = useMemo(() => new Set(listColumns), [listColumns]);

    const rootEntries = useMemo(() => {
        const system = SYSTEM_FIELDS.map((entry) => ({
            path: entry.name,
            label: t(`collections.columnPicker.${entry.labelKey}`),
            field: null as CollectionFieldRow | null,
        }));

        const fieldEntries = fields.map((field) => ({
            path: field.name,
            label: getFieldDisplayName(field.settings, field.name),
            field: field as CollectionFieldRow | null,
        }));

        return [...system, ...fieldEntries];
    }, [fields, t]);

    const drillableEntries = rootEntries.filter(
        (entry) =>
            entry.field !== null &&
            isDrillable(entry.field.type) &&
            (relatedFieldsCatalog[entry.path]?.length ?? 0) > 0,
    );

    const drillChildren = drillField
        ? (relatedFieldsCatalog[drillField.name] ?? [])
        : [];

    const togglePath = (path: string): void => {
        if (visible.has(path)) {
            onChange(listColumns.filter((column) => column !== path));

            return;
        }

        onChange([...listColumns, path]);
    };

    const openDrill = (field: CollectionFieldRow | null): void => {
        setDrillField(field);
        setSearch('');
    };

    const closeAndReset = (nextOpen: boolean): void => {
        setOpen(nextOpen);

        if (!nextOpen) {
            setSearch('');
            setDrillField(null);
        }
    };

    const columnItem = (path: string, label: string) => (
        <CommandItem
            key={path}
            value={path}
            keywords={[label]}
            onSelect={() => togglePath(path)}
        >
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <Check
                className={visible.has(path) ? 'ml-auto' : 'ml-auto opacity-0'}
                aria-hidden="true"
            />
        </CommandItem>
    );

    return (
        <Popover open={open} onOpenChange={closeAndReset}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('a11y.configureColumns')}
                    aria-expanded={open}
                    aria-haspopup="dialog"
                >
                    <Plus className="size-3.5" aria-hidden="true" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
                <Command>
                    <CommandInput
                        value={search}
                        onValueChange={setSearch}
                        placeholder={t('collections.searchFields')}
                        maxLength={STRING_LIMITS.SEARCH}
                    />
                    <CommandList>
                        <CommandEmpty>
                            {drillField
                                ? t('collections.columnPicker.noNestedFields')
                                : t('collections.columnPicker.noMatches')}
                        </CommandEmpty>
                        {drillField ? (
                            <>
                                <CommandGroup>
                                    <CommandItem
                                        value="__back"
                                        forceMount
                                        onSelect={() => openDrill(null)}
                                    >
                                        <ChevronLeft aria-hidden="true" />
                                        {t('common.back')}
                                    </CommandItem>
                                </CommandGroup>
                                <CommandSeparator />
                                <CommandGroup
                                    heading={getFieldDisplayName(
                                        drillField.settings,
                                        drillField.name,
                                    )}
                                >
                                    {drillChildren.map((entry) =>
                                        columnItem(
                                            `${drillField.name}.${entry.name}`,
                                            entry.display_name,
                                        ),
                                    )}
                                </CommandGroup>
                            </>
                        ) : (
                            <>
                                <CommandGroup
                                    heading={t(
                                        'collections.columnPicker.fields',
                                    )}
                                >
                                    {rootEntries.map((entry) =>
                                        columnItem(entry.path, entry.label),
                                    )}
                                </CommandGroup>
                                {drillableEntries.length > 0 ? (
                                    <CommandGroup
                                        heading={t(
                                            'collections.columnPicker.related',
                                        )}
                                    >
                                        {drillableEntries.map((entry) => (
                                            <CommandItem
                                                key={`related-${entry.path}`}
                                                value={`related:${entry.path}`}
                                                keywords={[entry.label]}
                                                aria-label={t(
                                                    'collections.columnPicker.openRelated',
                                                    { label: entry.label },
                                                )}
                                                onSelect={() =>
                                                    openDrill(entry.field)
                                                }
                                            >
                                                <span className="min-w-0 flex-1 truncate">
                                                    {entry.label}
                                                </span>
                                                <ChevronRight
                                                    className="ml-auto"
                                                    aria-hidden="true"
                                                />
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                ) : null}
                            </>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

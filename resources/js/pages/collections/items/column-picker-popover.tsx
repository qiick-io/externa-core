import { Check, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { getFieldDisplayName } from '@/lib/collection-field-types';
import { cn } from '@/lib/utils';
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

const SYSTEM_FIELDS: RelatedFieldEntry[] = [
    { name: 'id', display_name: 'ID', type: 'system' },
    { name: 'created_at', display_name: 'Created at', type: 'system' },
    { name: 'updated_at', display_name: 'Updated at', type: 'system' },
    { name: 'user_created', display_name: 'Created by', type: 'system' },
    { name: 'user_updated', display_name: 'Updated by', type: 'system' },
];

function isDrillable(type: string): boolean {
    return [
        'relation',
        'many_to_one',
        'one_to_many',
        'many_to_many',
        'relation_tree',
        'relation_many',
        'image',
        'file',
        'files',
    ].includes(type);
}

/**
 * Column picker: search, toggle, drill-down one level on relation/file.
 */
export function ColumnPickerPopover({
    fields,
    listColumns,
    relatedFieldsCatalog,
    onChange,
}: ColumnPickerPopoverProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [drillField, setDrillField] = useState<CollectionFieldRow | null>(
        null,
    );

    const visible = useMemo(() => new Set(listColumns), [listColumns]);

    const rootEntries = useMemo(() => {
        const fieldEntries = fields.map((field) => ({
            path: field.name,
            label: getFieldDisplayName(field.settings, field.name),
            type: field.type,
            field,
        }));

        const system = SYSTEM_FIELDS.map((entry) => ({
            path: entry.name,
            label: entry.display_name,
            type: entry.type,
            field: null as CollectionFieldRow | null,
        }));

        return [...system, ...fieldEntries];
    }, [fields]);

    const filteredRoot = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) {
            return rootEntries;
        }

        return rootEntries.filter(
            (entry) =>
                entry.label.toLowerCase().includes(q) ||
                entry.path.toLowerCase().includes(q),
        );
    }, [rootEntries, search]);

    const drillChildren = useMemo(() => {
        if (!drillField) {
            return [];
        }

        const q = search.trim().toLowerCase();
        const children = relatedFieldsCatalog[drillField.name] ?? [];

        return children.filter((entry) => {
            if (!q) {
                return true;
            }

            return (
                entry.display_name.toLowerCase().includes(q) ||
                entry.name.toLowerCase().includes(q)
            );
        });
    }, [drillField, relatedFieldsCatalog, search]);

    const togglePath = (path: string): void => {
        if (visible.has(path)) {
            onChange(listColumns.filter((column) => column !== path));

            return;
        }

        onChange([...listColumns, path]);
    };

    const closeAndReset = (nextOpen: boolean): void => {
        setOpen(nextOpen);
        if (!nextOpen) {
            setSearch('');
            setDrillField(null);
        }
    };

    return (
        <Popover open={open} onOpenChange={closeAndReset}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Configure columns"
                >
                    <Plus className="size-3.5" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
                <div className="border-b p-2">
                    {drillField ? (
                        <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground mb-2 flex items-center gap-1 text-xs"
                            onClick={() => {
                                setDrillField(null);
                                setSearch('');
                            }}
                        >
                            <ChevronLeft className="size-3.5" />
                            Back
                        </button>
                    ) : null}
                    <div className="relative">
                        <Search className="text-muted-foreground absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search fields"
                            className="h-8 pl-7 text-sm"
                        />
                    </div>
                    {drillField ? (
                        <p className="text-muted-foreground mt-2 truncate px-1 text-xs font-medium">
                            {getFieldDisplayName(
                                drillField.settings,
                                drillField.name,
                            )}
                        </p>
                    ) : null}
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                    {drillField
                        ? drillChildren.map((entry) => {
                              const path = `${drillField.name}.${entry.name}`;
                              const active = visible.has(path);

                              return (
                                  <button
                                      key={path}
                                      type="button"
                                      className={cn(
                                          'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                                          active
                                              ? 'text-muted-foreground'
                                              : 'hover:bg-muted',
                                      )}
                                      onClick={() => togglePath(path)}
                                  >
                                      <span className="min-w-0 flex-1 truncate">
                                          {entry.display_name}
                                      </span>
                                      {active ? (
                                          <Check className="size-3.5 shrink-0 opacity-60" />
                                      ) : null}
                                  </button>
                              );
                          })
                        : filteredRoot.map((entry) => {
                              const active = visible.has(entry.path);
                              const drillChildrenCount =
                                  entry.field !== null &&
                                  isDrillable(entry.type)
                                      ? (relatedFieldsCatalog[entry.path]
                                            ?.length ?? 0)
                                      : 0;
                              const canDrill = drillChildrenCount > 0;

                              return (
                                  <div
                                      key={entry.path}
                                      className={cn(
                                          'flex items-center',
                                          active && 'text-muted-foreground',
                                      )}
                                  >
                                      <button
                                          type="button"
                                          className={cn(
                                              'flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-sm',
                                              !active && 'hover:bg-muted',
                                          )}
                                          onClick={() =>
                                              togglePath(entry.path)
                                          }
                                      >
                                          <span className="min-w-0 flex-1 truncate">
                                              {entry.label}
                                          </span>
                                          {active ? (
                                              <Check className="size-3.5 shrink-0 opacity-60" />
                                          ) : null}
                                      </button>
                                      {canDrill && entry.field ? (
                                          <button
                                              type="button"
                                              className="hover:bg-muted text-muted-foreground hover:text-foreground mr-1 rounded p-1"
                                              aria-label={`Open ${entry.label} fields`}
                                              onClick={() => {
                                                  setDrillField(entry.field);
                                                  setSearch('');
                                              }}
                                          >
                                              <ChevronRight className="size-3.5" />
                                          </button>
                                      ) : null}
                                  </div>
                              );
                          })}
                    {drillField && drillChildren.length === 0 ? (
                        <p className="text-muted-foreground px-3 py-2 text-sm">
                            No nested fields available.
                        </p>
                    ) : null}
                </div>
            </PopoverContent>
        </Popover>
    );
}

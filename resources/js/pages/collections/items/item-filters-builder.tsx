import { Filter, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    countActiveFilterRules,
    emptyFilterRule,
    isFilterableFieldType,
    OPERATOR_LABELS,
    operatorNeedsValue,
    type FilterOperator,
    type FilterRule,
    FILTER_OPERATORS,
} from '@/lib/item-list-filters';
import type { CollectionFieldRow } from '@/types';

type ItemFiltersBuilderProps = {
    fields: CollectionFieldRow[];
    rules: FilterRule[];
    onChange: (rules: FilterRule[]) => void;
    onApply: () => void;
    onClear: () => void;
};

/**
 * Popover filter builder for collection items list (AND multi-field).
 */
export function ItemFiltersBuilder({
    fields,
    rules,
    onChange,
    onApply,
    onClear,
}: ItemFiltersBuilderProps) {
    const [open, setOpen] = useState(false);

    const filterableFields = useMemo(
        () => fields.filter((field) => isFilterableFieldType(field.type)),
        [fields],
    );

    const activeCount = countActiveFilterRules(rules);

    const updateRule = (id: string, patch: Partial<FilterRule>): void => {
        onChange(
            rules.map((rule) =>
                rule.id === id ? { ...rule, ...patch } : rule,
            ),
        );
    };

    const removeRule = (id: string): void => {
        onChange(rules.filter((rule) => rule.id !== id));
    };

    const addRule = (): void => {
        const defaultField = filterableFields[0]?.name ?? '';
        onChange([...rules, emptyFilterRule(defaultField)]);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5"
                    aria-label="Field filters"
                >
                    <Filter className="size-4" />
                    Filters
                    {activeCount > 0 ? (
                        <span className="bg-primary text-primary-foreground inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-medium">
                            {activeCount}
                        </span>
                    ) : null}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(100vw-2rem,28rem)] space-y-3 p-3" align="start">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Field filters</p>
                    {activeCount > 0 ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                                onClear();
                                setOpen(false);
                            }}
                        >
                            <X className="mr-1 size-3" />
                            Clear all
                        </Button>
                    ) : null}
                </div>
                <p className="text-muted-foreground text-xs">
                    Rules are AND-combined and written to the URL (
                    <code className="text-[10px]">filter[field][_eq]=…</code>
                    ).
                </p>

                {filterableFields.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                        No filterable fields on this collection.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {rules.map((rule) => (
                            <div
                                key={rule.id}
                                className="flex flex-wrap items-center gap-1.5"
                            >
                                <select
                                    className="h-8 min-w-24 flex-1 rounded-md border bg-background px-2 text-xs"
                                    value={rule.field}
                                    aria-label="Filter field"
                                    onChange={(e) =>
                                        updateRule(rule.id, {
                                            field: e.target.value,
                                        })
                                    }
                                >
                                    {filterableFields.map((field) => (
                                        <option
                                            key={field.name}
                                            value={field.name}
                                        >
                                            {field.name}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    className="h-8 min-w-28 rounded-md border bg-background px-2 text-xs"
                                    value={rule.operator}
                                    aria-label="Filter operator"
                                    onChange={(e) =>
                                        updateRule(rule.id, {
                                            operator: e.target
                                                .value as FilterOperator,
                                        })
                                    }
                                >
                                    {FILTER_OPERATORS.map((op) => (
                                        <option key={op} value={op}>
                                            {OPERATOR_LABELS[op]}
                                        </option>
                                    ))}
                                </select>
                                {operatorNeedsValue(rule.operator) ? (
                                    <Input
                                        className="h-8 min-w-24 flex-1 text-xs"
                                        value={rule.value}
                                        placeholder={
                                            rule.operator === '_in'
                                                ? 'a, b, c'
                                                : 'Value'
                                        }
                                        aria-label="Filter value"
                                        onChange={(e) =>
                                            updateRule(rule.id, {
                                                value: e.target.value,
                                            })
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                onApply();
                                                setOpen(false);
                                            }
                                        }}
                                    />
                                ) : null}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2"
                                    aria-label="Remove filter"
                                    onClick={() => removeRule(rule.id)}
                                >
                                    <X className="size-3.5" />
                                </Button>
                            </div>
                        ))}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={addRule}
                            >
                                <Plus className="mr-1 size-3.5" />
                                Add rule
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => {
                                    onApply();
                                    setOpen(false);
                                }}
                            >
                                Apply
                            </Button>
                        </div>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}

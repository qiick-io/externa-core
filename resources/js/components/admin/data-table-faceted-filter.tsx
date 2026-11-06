import { Check, PlusCircle } from 'lucide-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
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
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export type DataTableFacetedFilterOption = {
    value: string;
    label: string;
    icon?: ComponentType<{ className?: string }>;
};

export type DataTableFacetedFilterProps = {
    /** Visible trigger text (the facet: "Action", "Status"). */
    title: string;
    options: DataTableFacetedFilterOption[];
    /** Values currently applied on the server. */
    selectedValues: string[];
    onSelectedValuesChange: (values: string[]) => void;
    /** `false` keeps one value at a time (the server filters on one). */
    isMultiple?: boolean;
    /** Accessible name of the trigger, when it should differ from `title`. */
    ariaLabel?: string;
    className?: string;
};

/**
 * Faceted filter of the shadcn data-table pattern: an outline trigger with the
 * selected values as badges, opening a searchable `Command` list in a
 * `Popover`. Server-driven: the page turns the new values into a visit.
 *
 * @param props - See {@link DataTableFacetedFilterProps}.
 * @returns {JSX.Element}
 */
export function DataTableFacetedFilter({
    title,
    options,
    selectedValues,
    onSelectedValuesChange,
    isMultiple = true,
    ariaLabel,
    className,
}: DataTableFacetedFilterProps) {
    const { t } = useTranslation();
    const selected = new Set(selectedValues);

    const toggleValue = (value: string): void => {
        if (!isMultiple) {
            onSelectedValuesChange(selected.has(value) ? [] : [value]);

            return;
        }

        onSelectedValuesChange(
            selected.has(value)
                ? selectedValues.filter((current) => current !== value)
                : [...selectedValues, value],
        );
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    aria-label={ariaLabel}
                    className={cn('justify-start border-dashed', className)}
                >
                    <PlusCircle aria-hidden="true" />
                    {title}
                    {selected.size > 0 ? (
                        <>
                            <Separator
                                orientation="vertical"
                                className="mx-0.5 data-[orientation=vertical]:h-4"
                            />
                            <Badge
                                variant="secondary"
                                className="rounded-sm px-1 font-normal lg:hidden"
                            >
                                {selected.size}
                            </Badge>
                            <div className="hidden min-w-0 gap-1 lg:flex">
                                {selected.size > 2 ? (
                                    <Badge
                                        variant="secondary"
                                        className="rounded-sm px-1 font-normal"
                                    >
                                        {t('common.selectedCount', {
                                            count: selected.size,
                                        })}
                                    </Badge>
                                ) : (
                                    options
                                        .filter((option) =>
                                            selected.has(option.value),
                                        )
                                        .map((option) => (
                                            <Badge
                                                key={option.value}
                                                variant="secondary"
                                                className="truncate rounded-sm px-1 font-normal"
                                            >
                                                {option.label}
                                            </Badge>
                                        ))
                                )}
                            </div>
                        </>
                    ) : null}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[12.5rem] p-0" align="start">
                <Command>
                    <CommandInput placeholder={title} />
                    <CommandList>
                        <CommandEmpty>{t('common.noResults')}</CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => {
                                const isSelected = selected.has(option.value);

                                return (
                                    <CommandItem
                                        key={option.value}
                                        value={option.label}
                                        onSelect={() =>
                                            toggleValue(option.value)
                                        }
                                    >
                                        <div
                                            className={cn(
                                                'flex size-4 items-center justify-center rounded-[4px] border',
                                                isSelected
                                                    ? 'border-primary bg-primary text-primary-foreground'
                                                    : 'border-input [&_svg]:invisible',
                                            )}
                                        >
                                            <Check
                                                className="size-3.5 text-primary-foreground"
                                                aria-hidden="true"
                                            />
                                        </div>
                                        {option.icon ? (
                                            <option.icon className="size-4 text-muted-foreground" />
                                        ) : null}
                                        <span>{option.label}</span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                        {selected.size > 0 ? (
                            <>
                                <CommandSeparator />
                                <CommandGroup>
                                    <CommandItem
                                        onSelect={() =>
                                            onSelectedValuesChange([])
                                        }
                                        className="justify-center text-center"
                                    >
                                        {t('common.clearFilters')}
                                    </CommandItem>
                                </CommandGroup>
                            </>
                        ) : null}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

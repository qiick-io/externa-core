import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { Spinner } from '@/components/ui/spinner';
import {
    formatUserDisplayName,
    getInitialsFromParts,
} from '@/hooks/use-initials';
import { avatarToneClass } from '@/lib/avatar-tone';
import {
    fieldControlHeight,
    fieldFocusRing,
    fieldOpenBorder,
} from '@/lib/field-control-chrome';
import { cn } from '@/lib/utils';
import type { AdminSelectOption, Paginated } from '@/types/admin';

export type PaginatedMultiSelectProps = {
    value?: number[];
    onChange?: (value: number[]) => void;
    fetchUrl: string;
    placeholder?: string;
    disabled?: boolean;
    multiple?: boolean;
    /** Pre-loaded labels for selected IDs (edit mode) */
    initialOptions?: AdminSelectOption[];
    perPage?: number;
    className?: string;
    /** Avatar + name / email below for user options */
    showUserDetails?: boolean;
};

function mapResponse(data: unknown): Paginated<AdminSelectOption> {
    const payload = data as Paginated<{
        id: number;
        name?: string;
        label?: string;
        first_name?: string;
        last_name?: string | null;
        email?: string;
    }> & {
        meta?: { current_page?: number; last_page?: number };
    };

    const currentPage = payload.current_page ?? payload.meta?.current_page ?? 1;
    const lastPage = payload.last_page ?? payload.meta?.last_page ?? 1;

    return {
        ...payload,
        current_page: currentPage,
        last_page: lastPage,
        data: payload.data.map((row) => {
            const firstName = row.first_name ?? '';
            const lastName = row.last_name ?? null;
            const email = row.email;
            const displayName =
                formatUserDisplayName(firstName, lastName) ||
                row.name ||
                email ||
                String(row.id);

            return {
                id: row.id,
                label:
                    row.label ??
                    (email ? `${displayName} (${email})` : displayName),
                first_name: firstName || undefined,
                last_name: lastName,
                email,
            };
        }),
    };
}

function optionDisplayName(option: AdminSelectOption): string {
    if (option.first_name) {
        return (
            formatUserDisplayName(option.first_name, option.last_name) ||
            option.label
        );
    }

    return option.label;
}

/**
 * Server-searched picker on the shadcn combobox pattern: Popover + Command
 * (`shouldFilter={false}`, the server filters), Badge chips in the trigger.
 * Search is debounced (300 ms); the list loads the next page when scrolled
 * near its end. `multiple={false}` keeps at most one id.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function PaginatedMultiSelect({
    value = [],
    onChange,
    fetchUrl,
    placeholder = 'Select…',
    disabled = false,
    multiple = true,
    initialOptions = [],
    perPage = 20,
    className,
    showUserDetails = false,
}: PaginatedMultiSelectProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [options, setOptions] = useState<AdminSelectOption[]>(initialOptions);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    const fetchingRef = useRef(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 300);

        return () => clearTimeout(timer);
    }, [search]);

    const selectedLabels = useMemo(() => {
        const map = new Map(options.map((o) => [o.id, o]));

        for (const opt of initialOptions) {
            map.set(opt.id, opt);
        }

        return value.map((id) => {
            const option = map.get(id);

            return option ? optionDisplayName(option) : `#${id}`;
        });
    }, [value, options, initialOptions]);

    const fetchPage = useCallback(
        async (targetPage: number, reset: boolean) => {
            if (fetchingRef.current) {
                return;
            }

            fetchingRef.current = true;
            setLoading(true);

            try {
                const params = new URLSearchParams({
                    page: String(targetPage),
                    per_page: String(perPage),
                });

                if (debouncedSearch) {
                    params.set('search', debouncedSearch);
                }

                const separator = fetchUrl.includes('?') ? '&' : '?';
                const response = await fetch(
                    `${fetchUrl}${separator}${params.toString()}`,
                    {
                        headers: {
                            Accept: 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        credentials: 'same-origin',
                    },
                );

                if (!response.ok) {
                    return;
                }

                const raw: unknown = await response.json();
                const json = mapResponse(raw);

                setOptions((prev) =>
                    reset ? json.data : [...prev, ...json.data],
                );
                setHasMore(json.current_page < json.last_page);
                setPage(json.current_page);
            } catch {
                // leave options as-is; loading cleared in finally
            } finally {
                fetchingRef.current = false;
                setLoading(false);
            }
        },
        [debouncedSearch, fetchUrl, perPage],
    );

    useEffect(() => {
        if (!open) {
            return;
        }

        void fetchPage(1, true);
    }, [open, debouncedSearch, fetchPage]);

    const toggle = (id: number): void => {
        if (!multiple) {
            onChange?.(value.includes(id) ? [] : [id]);

            return;
        }

        const next = value.includes(id)
            ? value.filter((selectedId) => selectedId !== id)
            : [...value, id];
        onChange?.(next);
    };

    const handleListScroll = (event: UIEvent<HTMLDivElement>): void => {
        const list = event.currentTarget;

        if (loading || !hasMore) {
            return;
        }

        if (list.scrollTop + list.clientHeight >= list.scrollHeight - 24) {
            void fetchPage(page + 1, false);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        'w-full justify-between font-normal focus-visible:ring-offset-0',
                        fieldFocusRing,
                        fieldOpenBorder,
                        multiple
                            ? 'h-auto min-h-control'
                            : cn(fieldControlHeight, 'overflow-hidden'),
                        className,
                    )}
                >
                    <span className="flex flex-1 flex-wrap gap-1 text-left">
                        {value.length === 0 ? (
                            <span className="text-muted-foreground">
                                {placeholder}
                            </span>
                        ) : (
                            selectedLabels.map((label, index) => (
                                <Badge
                                    key={`${value[index]}-${label}`}
                                    variant="secondary"
                                    className="font-normal"
                                >
                                    {label}
                                </Badge>
                            ))
                        )}
                    </span>
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-(--radix-popover-trigger-width) p-0"
                align="start"
            >
                <Command shouldFilter={false}>
                    <CommandInput
                        value={search}
                        onValueChange={setSearch}
                        placeholder={t('picker.search')}
                        aria-label={t('a11y.search')}
                    />
                    <CommandList onScroll={handleListScroll}>
                        {!loading && (
                            <CommandEmpty>{t('picker.noResults')}</CommandEmpty>
                        )}
                        {options.length > 0 && (
                            <CommandGroup>
                                {options.map((option) => {
                                    const isSelected = value.includes(
                                        option.id,
                                    );
                                    const name = optionDisplayName(option);

                                    return (
                                        <CommandItem
                                            key={option.id}
                                            value={String(option.id)}
                                            onSelect={() => toggle(option.id)}
                                            data-checked={isSelected}
                                        >
                                            {multiple && (
                                                <span
                                                    aria-hidden
                                                    className={cn(
                                                        'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input',
                                                        isSelected &&
                                                            'border-primary bg-primary text-primary-foreground',
                                                    )}
                                                >
                                                    {isSelected && (
                                                        <Check className="size-3.5 text-primary-foreground" />
                                                    )}
                                                </span>
                                            )}
                                            {showUserDetails ? (
                                                <>
                                                    <Avatar className="size-8">
                                                        <AvatarFallback
                                                            className={cn(
                                                                avatarToneClass(
                                                                    option.id,
                                                                ),
                                                                'text-xs font-medium',
                                                            )}
                                                        >
                                                            {getInitialsFromParts(
                                                                option.first_name ??
                                                                    name,
                                                                option.last_name,
                                                            ) || '?'}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate font-medium">
                                                            {name}
                                                        </span>
                                                        {option.email ? (
                                                            <span className="block truncate text-xs text-muted-foreground">
                                                                {option.email}
                                                            </span>
                                                        ) : null}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="flex-1 truncate">
                                                    {option.label}
                                                </span>
                                            )}
                                            {!multiple && (
                                                <Check
                                                    className={cn(
                                                        'ml-auto text-primary',
                                                        !isSelected &&
                                                            'opacity-0',
                                                    )}
                                                />
                                            )}
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        )}
                        {loading && (
                            <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
                                <Spinner aria-hidden />
                                {t('picker.loading')}
                            </div>
                        )}
                        {value.length > 0 && (
                            <>
                                <CommandSeparator />
                                <CommandGroup>
                                    <CommandItem
                                        value="__clear-selection__"
                                        onSelect={() => onChange?.([])}
                                        className="justify-center text-center"
                                    >
                                        <X />
                                        {t('picker.clearSelection')}
                                    </CommandItem>
                                </CommandGroup>
                            </>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

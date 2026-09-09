import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    formatUserDisplayName,
    getInitialsFromParts,
} from '@/hooks/use-initials';
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

    const currentPage =
        payload.current_page ?? payload.meta?.current_page ?? 1;
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
                label: row.label ?? (email ? `${displayName} (${email})` : displayName),
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
 * Reusable multi-select with server-side pagination.
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
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [options, setOptions] = useState<AdminSelectOption[]>(initialOptions);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    const fetchingRef = useRef(false);
    const listRef = useRef<HTMLDivElement>(null);

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

    const handleScroll = (): void => {
        const el = listRef.current;

        if (!el || loading || !hasMore) {
            return;
        }

        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
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
                        'h-auto min-h-9 w-full justify-between font-normal',
                        className,
                    )}
                >
                    <span className="flex flex-1 flex-wrap gap-1 text-left">
                        {value.length === 0 ? (
                            <span className="text-muted-foreground">
                                {placeholder}
                            </span>
                        ) : (
                            selectedLabels.map((label, i) => (
                                <Badge
                                    key={`${value[i]}-${label}`}
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
                <div className="flex items-center gap-2 border-b p-2">
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search…"
                        className="h-8"
                    />
                    {value.length > 0 && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0"
                            onClick={() => onChange?.([])}
                        >
                            <X className="size-4" />
                        </Button>
                    )}
                </div>
                <div
                    ref={listRef}
                    className="max-h-60 overflow-y-auto p-1"
                    onScroll={handleScroll}
                >
                    {options.length === 0 && !loading && (
                        <p className="p-3 text-sm text-muted-foreground">
                            No results.
                        </p>
                    )}
                    {options.map((option) => {
                        const checked = value.includes(option.id);
                        const name = optionDisplayName(option);
                        const initials = getInitialsFromParts(
                            option.first_name ?? name,
                            option.last_name,
                        );

                        return (
                            <div
                                key={option.id}
                                role="option"
                                aria-selected={checked}
                                tabIndex={0}
                                className={cn(
                                    'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent',
                                    checked && 'bg-accent/50',
                                )}
                                onClick={() => toggle(option.id)}
                                onKeyDown={(event) => {
                                    if (
                                        event.key === 'Enter' ||
                                        event.key === ' '
                                    ) {
                                        event.preventDefault();
                                        toggle(option.id);
                                    }
                                }}
                            >
                                <Checkbox
                                    checked={checked}
                                    tabIndex={-1}
                                    onCheckedChange={() => toggle(option.id)}
                                    onClick={(event) => event.stopPropagation()}
                                />
                                {showUserDetails ? (
                                    <>
                                        <Avatar
                                            userId={option.id}
                                            className="size-8"
                                        >
                                            <AvatarFallback className="text-xs font-medium">
                                                {initials || '?'}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className="min-w-0 flex-1 text-left">
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
                                    <span className="flex-1 truncate text-left">
                                        {option.label}
                                    </span>
                                )}
                                {checked && (
                                    <Check className="size-4 shrink-0 text-primary" />
                                )}
                            </div>
                        );
                    })}
                    {loading && (
                        <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            Loading…
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
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
};

function mapResponse(data: unknown): Paginated<AdminSelectOption> {
    const payload = data as Paginated<{
        id: number;
        name?: string;
        label?: string;
        first_name?: string;
        last_name?: string | null;
        email?: string;
    }>;

    return {
        ...payload,
        data: payload.data.map((row) => ({
            id: row.id,
            label:
                row.label ??
                row.name ??
                ([row.first_name, row.last_name].filter(Boolean).join(' ') ||
                    row.email ||
                    String(row.id)),
        })),
    };
}

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
        const map = new Map(options.map((o) => [o.id, o.label]));
        for (const opt of initialOptions) {
            map.set(opt.id, opt.label);
        }

        return value.map((id) => map.get(id) ?? `#${id}`);
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

                const json = mapResponse(await response.json());

                setOptions((prev) =>
                    reset ? json.data : [...prev, ...json.data],
                );
                setHasMore(json.current_page < json.last_page);
                setPage(json.current_page);
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
            <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
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
                        <p className="text-muted-foreground p-3 text-sm">
                            No results.
                        </p>
                    )}
                    {options.map((option) => {
                        const checked = value.includes(option.id);

                        return (
                            <button
                                key={option.id}
                                type="button"
                                className={cn(
                                    'hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                                    checked && 'bg-accent/50',
                                )}
                                onClick={() => toggle(option.id)}
                            >
                                <Checkbox checked={checked} />
                                <span className="flex-1 truncate text-left">
                                    {option.label}
                                </span>
                                {checked && (
                                    <Check className="text-primary size-4 shrink-0" />
                                )}
                            </button>
                        );
                    })}
                    {loading && (
                        <div className="text-muted-foreground flex items-center justify-center gap-2 py-3 text-sm">
                            <Loader2 className="size-4 animate-spin" />
                            Loading…
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

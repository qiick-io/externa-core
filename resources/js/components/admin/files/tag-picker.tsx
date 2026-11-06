import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { useState } from 'react';
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
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { FileTag } from '@/types/files';

type TagPickerProps = {
    value: string[];
    onChange: (tags: string[]) => void;
    catalog: FileTag[];
    disabled?: boolean;
    placeholder?: string;
    id?: string;
};

/**
 * @param catalog - Existing tags.
 * @param typedName - Trimmed name the user typed.
 * @returns The catalog tag with exactly that name, if any.
 */
function findExactCatalogMatch(
    catalog: FileTag[],
    typedName: string,
): FileTag | undefined {
    return catalog.find((tag) => tag.name === typedName);
}

/**
 * Assigns tags to files: the shadcn combobox pattern (Popover + Command) with
 * the chosen tags as removable `Badge` chips above the trigger. Typing a new
 * name offers "Create"; an exact catalog match reuses the existing tag.
 *
 * @param {TagPickerProps} props - Component props.
 * @returns {JSX.Element}
 */
export function TagPicker({
    value,
    onChange,
    catalog,
    disabled = false,
    placeholder,
    id,
}: TagPickerProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const resolvedPlaceholder = placeholder ?? t('files.tags.placeholder');
    const trimmedQuery = query.trim();
    const exactMatch = trimmedQuery
        ? findExactCatalogMatch(catalog, trimmedQuery)
        : undefined;
    const canCreate =
        trimmedQuery !== '' && !exactMatch && !value.includes(trimmedQuery);

    const toggleTagName = (tagName: string): void => {
        if (value.includes(tagName)) {
            onChange(value.filter((entry) => entry !== tagName));

            return;
        }

        onChange([...value, tagName]);
    };

    const createTag = (): void => {
        if (!canCreate) {
            return;
        }

        onChange([...value, trimmedQuery]);
        setQuery('');
    };

    return (
        <div className="space-y-2">
            {value.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {value.map((tagName) => (
                        <Badge
                            key={tagName}
                            variant="secondary"
                            className="gap-1 pr-1"
                        >
                            {tagName}
                            <button
                                type="button"
                                className="rounded-sm opacity-70 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none"
                                disabled={disabled}
                                aria-label={t('files.tags.remove', {
                                    name: tagName,
                                })}
                                onClick={() => toggleTagName(tagName)}
                            >
                                <X className="size-3" aria-hidden="true" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}

            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        id={id}
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        disabled={disabled}
                        className="w-full justify-between font-normal text-muted-foreground"
                    >
                        {resolvedPlaceholder}
                        <ChevronsUpDown
                            className="opacity-50"
                            aria-hidden="true"
                        />
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    className="w-(--radix-popover-trigger-width) p-0"
                    align="start"
                >
                    <Command>
                        <CommandInput
                            value={query}
                            onValueChange={setQuery}
                            placeholder={resolvedPlaceholder}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && canCreate) {
                                    event.preventDefault();
                                    createTag();
                                }
                            }}
                        />
                        <CommandList>
                            <CommandEmpty>
                                {catalog.length === 0
                                    ? t('files.tags.empty')
                                    : t('common.noResults')}
                            </CommandEmpty>
                            {canCreate ? (
                                <CommandGroup forceMount>
                                    <CommandItem
                                        forceMount
                                        value={`create:${trimmedQuery}`}
                                        onSelect={createTag}
                                    >
                                        <Plus aria-hidden="true" />
                                        {t('files.tags.create', {
                                            name: trimmedQuery,
                                        })}
                                    </CommandItem>
                                </CommandGroup>
                            ) : null}
                            {catalog.length > 0 ? (
                                <CommandGroup
                                    heading={t('files.tags.existing')}
                                >
                                    {catalog.map((tag) => (
                                        <CommandItem
                                            key={tag.id}
                                            value={tag.name}
                                            onSelect={() =>
                                                toggleTagName(tag.name)
                                            }
                                        >
                                            <Check
                                                className={cn(
                                                    value.includes(tag.name)
                                                        ? 'opacity-100'
                                                        : 'opacity-0',
                                                )}
                                                aria-hidden="true"
                                            />
                                            {tag.name}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            ) : null}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
}

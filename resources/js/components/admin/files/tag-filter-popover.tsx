import { Check, Tags } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import type { FileTag } from '@/types/files';

type TagFilterPopoverProps = {
    catalog: FileTag[];
    selectedTagIds: number[];
    onChange: (tagIds: number[]) => void;
};

/**
 * Filters files by tag: the shadcn faceted filter pattern (Popover +
 * Command with a check per tag, "Clear" at the bottom). A file matches when
 * it has any of the selected tags.
 *
 * @param {TagFilterPopoverProps} props - Component props.
 * @returns {JSX.Element}
 */
export function TagFilterPopover({
    catalog,
    selectedTagIds,
    onChange,
}: TagFilterPopoverProps) {
    const { t } = useTranslation();
    const selectedCount = selectedTagIds.length;

    const toggleTagId = (tagId: number): void => {
        if (selectedTagIds.includes(tagId)) {
            onChange(selectedTagIds.filter((entry) => entry !== tagId));

            return;
        }

        onChange([...selectedTagIds, tagId]);
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    aria-label={t('files.tags.filterBy')}
                >
                    <Tags className="size-4" />
                    {t('files.tags.label')}
                    {selectedCount > 0 && (
                        <Badge className="min-w-5 rounded-full px-1.5 tabular-nums">
                            {selectedCount}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
                <Command>
                    <CommandInput placeholder={t('files.tags.filterBy')} />
                    <CommandList>
                        <CommandEmpty>
                            {catalog.length === 0
                                ? t('files.tags.empty')
                                : t('common.noResults')}
                        </CommandEmpty>
                        {catalog.length > 0 ? (
                            <CommandGroup heading={t('files.tags.filterHint')}>
                                {catalog.map((tag) => {
                                    const isSelected = selectedTagIds.includes(
                                        tag.id,
                                    );

                                    return (
                                        <CommandItem
                                            key={tag.id}
                                            value={tag.name}
                                            onSelect={() => toggleTagId(tag.id)}
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
                                            <span>{tag.name}</span>
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        ) : null}
                        {selectedCount > 0 ? (
                            <>
                                <CommandSeparator />
                                <CommandGroup>
                                    <CommandItem
                                        onSelect={() => onChange([])}
                                        className="justify-center text-center"
                                    >
                                        {t('files.tags.clear')}
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

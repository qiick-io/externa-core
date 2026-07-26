import { Tags, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
 * Popover to filter files by tag.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function TagFilterPopover({
    catalog,
    selectedTagIds,
    onChange,
}: TagFilterPopoverProps) {
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
                    size="sm"
                    className="h-9 gap-1.5"
                    aria-label="Filter by tags"
                >
                    <Tags className="size-4" />
                    Tags
                    {selectedCount > 0 && (
                        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
                            {selectedCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="start">
                <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Filter by tags</p>
                    {selectedCount > 0 && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => onChange([])}
                        >
                            <X className="mr-1 size-3" />
                            Clear
                        </Button>
                    )}
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                    Show files that have any of the selected tags.
                </p>
                {catalog.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                        No tags yet. Tag a file to create one.
                    </p>
                ) : (
                    <div className="flex max-h-56 flex-wrap gap-1 overflow-y-auto">
                        {catalog.map((tag) => {
                            const selected = selectedTagIds.includes(tag.id);

                            return (
                                <button
                                    key={tag.id}
                                    type="button"
                                    className={cn(
                                        'rounded-md border px-2 py-0.5 text-xs transition-colors',
                                        selected
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-sidebar-border/70 hover:bg-muted',
                                    )}
                                    onClick={() => toggleTagId(tag.id)}
                                >
                                    {tag.name}
                                </button>
                            );
                        })}
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}

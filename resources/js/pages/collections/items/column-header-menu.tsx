import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    ArrowDownAZ,
    ArrowUpAZ,
    ChevronDown,
    EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type ColumnAlign = 'left' | 'center' | 'right';

type ColumnHeaderMenuProps = {
    label: string;
    sortActive: boolean;
    sortDirection?: 'asc' | 'desc';
    align: ColumnAlign;
    canHide: boolean;
    onSort: (direction: 'asc' | 'desc') => void;
    onAlign: (align: ColumnAlign) => void;
    onHide: () => void;
};

/**
 * Column header actions: sort, align, hide.
 */
export function ColumnHeaderMenu({
    label,
    sortActive,
    sortDirection,
    align,
    canHide,
    onSort,
    onAlign,
    onHide,
}: ColumnHeaderMenuProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                        'text-muted-foreground hover:text-foreground size-6 shrink-0',
                        sortActive && 'text-foreground',
                    )}
                    aria-label={`${label} column options`}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    {sortActive && sortDirection === 'asc' ? (
                        <ArrowUpAZ className="size-3.5" />
                    ) : sortActive && sortDirection === 'desc' ? (
                        <ArrowDownAZ className="size-3.5" />
                    ) : (
                        <ChevronDown className="size-3.5" />
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="start"
                className="w-44"
                onCloseAutoFocus={(event) => event.preventDefault()}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <DropdownMenuItem
                    onSelect={() => onSort('asc')}
                    className={cn(
                        sortActive && sortDirection === 'asc' && 'bg-accent',
                    )}
                >
                    <ArrowUpAZ className="size-4" />
                    Sort ascending
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() => onSort('desc')}
                    className={cn(
                        sortActive && sortDirection === 'desc' && 'bg-accent',
                    )}
                >
                    <ArrowDownAZ className="size-4" />
                    Sort descending
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onSelect={() => onAlign('left')}
                    className={cn(align === 'left' && 'bg-accent')}
                >
                    <AlignLeft className="size-4" />
                    Align left
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() => onAlign('center')}
                    className={cn(align === 'center' && 'bg-accent')}
                >
                    <AlignCenter className="size-4" />
                    Align center
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() => onAlign('right')}
                    className={cn(align === 'right' && 'bg-accent')}
                >
                    <AlignRight className="size-4" />
                    Align right
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    disabled={!canHide}
                    onSelect={() => {
                        if (canHide) {
                            onHide();
                        }
                    }}
                >
                    <EyeOff className="size-4" />
                    Hide field
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function alignClass(align: ColumnAlign | undefined): string {
    switch (align) {
        case 'center':
            return 'text-center';
        case 'right':
            return 'text-right';
        default:
            return 'text-left';
    }
}

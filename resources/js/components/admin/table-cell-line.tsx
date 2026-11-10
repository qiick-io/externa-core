import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * One-line table cell content: a primary label and an optional muted
 * secondary text side by side, both truncated, with the full text in a
 * Tooltip. Keeps admin table rows at the shared 41px height where a cell
 * used to stack two lines (name over email, tool over surface, ...). The
 * secondary text stays in the DOM, so screen readers read it in full.
 * @returns {JSX.Element}
 */
export function TableCellLine({
    primary,
    secondary,
    className,
}: {
    primary: string;
    secondary?: string | null;
    className?: string;
}) {
    const fullText = secondary ? `${primary} · ${secondary}` : primary;

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    className={cn(
                        'flex min-w-0 items-baseline gap-2 whitespace-nowrap',
                        className,
                    )}
                >
                    <span className="min-w-0 shrink truncate font-medium">
                        {primary}
                    </span>
                    {secondary ? (
                        <span className="min-w-0 shrink-[2] truncate text-xs text-muted-foreground">
                            {secondary}
                        </span>
                    ) : null}
                </span>
            </TooltipTrigger>
            <TooltipContent>{fullText}</TooltipContent>
        </Tooltip>
    );
}

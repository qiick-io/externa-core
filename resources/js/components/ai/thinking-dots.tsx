import { cn } from '@/lib/utils';

type ThinkingDotsProps = {
    className?: string;
    label?: string;
};

/**
 * Animated loading indicator for assistant responses in progress.
 * @param {ThinkingDotsProps} props - Component props.
 * @param {string} [props.className] - Additional wrapper classes.
 * @param {string} [props.label='Sto pensando'] - Accessible status label.
 * @returns {JSX.Element}
 */
export function ThinkingDots({
    className,
    label = 'Sto pensando',
}: ThinkingDotsProps) {
    return (
        <div
            className={cn(
                'flex items-center gap-1.5 text-muted-foreground',
                className,
            )}
            role="status"
            aria-label={label}
        >
            <span className="sr-only">{label}</span>
            {[0, 1, 2].map((index) => (
                <span
                    key={index}
                    className="size-1.5 animate-pulse rounded-full bg-current"
                    style={{ animationDelay: `${index * 160}ms` }}
                />
            ))}
        </div>
    );
}

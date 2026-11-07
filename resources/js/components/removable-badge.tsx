import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * Removable tag chip: a secondary `Badge` with a ghost `Button size="icon-xs"`
 * that removes it. The button needs its own `removeLabel` (e.g. "Remove tag
 * Foo") because the "×" icon alone has no accessible name. Without
 * `onRemove` the chip renders read-only, with no button.
 * @returns {JSX.Element}
 */
export function RemovableBadge({
    children,
    removeLabel,
    onRemove,
    disabled = false,
}: {
    children: ReactNode;
    removeLabel: string;
    onRemove?: () => void;
    disabled?: boolean;
}) {
    return (
        <Badge variant="secondary" className={onRemove ? 'pr-0.5' : undefined}>
            {children}
            {onRemove ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    // Negative block margin keeps the 24px hit area without
                    // making the chip taller than a plain Badge.
                    className="-my-1 rounded-sm"
                    disabled={disabled}
                    aria-label={removeLabel}
                    onClick={onRemove}
                >
                    <X aria-hidden="true" />
                </Button>
            ) : null}
        </Badge>
    );
}

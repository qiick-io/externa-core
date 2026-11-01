import type { LucideIcon } from 'lucide-react';

interface IconProps {
    iconNode?: LucideIcon | null;
    className?: string;
    /**
     * Accessible name for meaningful icons.
     * When set, the SVG is exposed as an image; otherwise it is decorative
     * (`aria-hidden`), matching lucide-react’s default when no a11y prop is passed.
     */
    label?: string;
}

/**
 * Thin Lucide wrapper with explicit icon semantics.
 * Decorative by default; pass `label` for status / standalone meaning.
 */
export function Icon({ iconNode: IconComponent, className, label }: IconProps) {
    if (!IconComponent) {
        return null;
    }

    if (label) {
        return (
            <IconComponent
                className={className}
                role="img"
                aria-label={label}
                aria-hidden={false}
            />
        );
    }

    return <IconComponent className={className} aria-hidden="true" />;
}

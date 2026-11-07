import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/*
 * AI Elements `shimmer` (registry.ai-sdk.dev). Change from the registry copy:
 * the moving highlight is the `shimmer` utility of shadcn's tailwind.css
 * (already used by `attachment`), not the `motion` package.
 */

export type TextShimmerProps = {
    children: ReactNode;
    as?: ElementType;
    className?: string;
};

export const Shimmer = ({
    children,
    as: Component = 'span',
    className,
}: TextShimmerProps) => (
    <Component className={cn('inline-block shimmer', className)}>
        {children}
    </Component>
);

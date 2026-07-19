import type { ReactNode } from 'react';
import type { BreadcrumbItem } from '@/types/navigation';

/** Props for authenticated app layouts (header or sidebar variant). */
export type AppLayoutProps = {
    children: ReactNode;
    breadcrumbs?: BreadcrumbItem[];
    headerActions?: ReactNode;
};

export type AppVariant = 'header' | 'sidebar';

/** Props for guest/auth marketing-style layouts. */
export type AuthLayoutProps = {
    children?: ReactNode;
    name?: string;
    title?: string;
    description?: string;
};

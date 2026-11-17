import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import type { BreadcrumbItem as BreadcrumbItemType } from '@/types';

/** Whether shortcut hints should say ⌘ rather than Ctrl. */
function isApplePlatform(): boolean {
    return (
        typeof navigator !== 'undefined' &&
        /Mac|iPhone|iPad/.test(navigator.userAgent)
    );
}

/**
 * The sidebar toggle with a tooltip that says what it does next ("Collapse sidebar" or "Expand
 * sidebar") and its shortcut (⌘B / Ctrl+B, registered by the sidebar itself). On phones the
 * toggle opens the menu sheet, so the tooltip keeps the generic label.
 */
function SidebarToggle() {
    const { t } = useTranslation();
    const { isMobile, state } = useSidebar();
    const label = isMobile
        ? t('a11y.toggleSidebar')
        : state === 'expanded'
          ? t('a11y.collapseSidebar')
          : t('a11y.expandSidebar');

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                {/* Keep the trigger's own slot name: the tooltip trigger would replace it. */}
                <SidebarTrigger
                    data-slot="sidebar-trigger"
                    className="shrink-0"
                />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="flex items-center gap-2">
                {label}
                <KbdGroup aria-hidden="true">
                    <Kbd>{isApplePlatform() ? '⌘' : 'Ctrl'}</Kbd>
                    <Kbd>B</Kbd>
                </KbdGroup>
            </TooltipContent>
        </Tooltip>
    );
}

/**
 * Top bar inside the sidebar layout: the sidebar toggle, then `leading` (the app-wide controls
 * that belong to navigation, such as the command palette's search icon), the breadcrumbs, and
 * the page's own actions on the right. Keeping search on the left leaves the right side to the
 * page, which matters in apps with several page actions.
 *
 * @param props.breadcrumbs - Breadcrumb trail.
 * @param props.leading - Icon controls right after the sidebar toggle (e.g. `CommandPaletteTrigger`).
 * @param props.actions - Optional right-aligned page actions.
 * @returns {JSX.Element}
 */
export function AppSidebarHeader({
    breadcrumbs = [],
    leading,
    actions,
}: {
    breadcrumbs?: BreadcrumbItemType[];
    leading?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border/40 px-6 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2">
                {/* Toggle and leading icons sit flush (their own padding spaces them); only the
                    breadcrumbs clip, so hover backgrounds and focus rings of the icons stay whole. */}
                <div className="flex shrink-0 items-center">
                    <SidebarToggle />
                    {leading}
                </div>
                <div className="min-w-0 overflow-hidden">
                    <Breadcrumbs breadcrumbs={breadcrumbs} />
                </div>
            </div>
            {actions ? (
                <div className="flex min-w-0 shrink-0 items-center justify-end gap-2 overflow-x-auto sm:gap-2">
                    {actions}
                </div>
            ) : null}
        </header>
    );
}

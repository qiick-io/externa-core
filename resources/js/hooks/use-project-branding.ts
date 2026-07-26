import { usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import type { ProjectAppearance } from '@/types/appearance';

/**
 * Applies shared project branding (primary colors + favicon) to the document.
 *
 * Sets `--brand-primary` / `--brand-primary-dark` as raw hex; CSS maps them
 * to `--primary` for light and `.dark` respectively (no automatic lightening).
 */
export function useProjectBranding(): ProjectAppearance | undefined {
    const { projectAppearance } = usePage().props;

    useEffect(() => {
        if (!projectAppearance) {
            return;
        }

        if (projectAppearance.projectColor) {
            document.documentElement.style.setProperty(
                '--brand-primary',
                projectAppearance.projectColor,
            );
            // Drop legacy inline --primary from older builds / appearance preview.
            document.documentElement.style.removeProperty('--primary');
            document.documentElement.style.removeProperty(
                '--primary-foreground',
            );
        }

        if (projectAppearance.primaryForeground) {
            document.documentElement.style.setProperty(
                '--brand-primary-foreground',
                projectAppearance.primaryForeground,
            );
        }

        const darkColor =
            projectAppearance.projectColorDark ??
            projectAppearance.projectColor;

        if (darkColor) {
            document.documentElement.style.setProperty(
                '--brand-primary-dark',
                darkColor,
            );
        }

        const darkForeground =
            projectAppearance.primaryForegroundDark ??
            projectAppearance.primaryForeground;

        if (darkForeground) {
            document.documentElement.style.setProperty(
                '--brand-primary-dark-foreground',
                darkForeground,
            );
        }

        if (projectAppearance.faviconUrl) {
            let link = document.querySelector<HTMLLinkElement>(
                "link[rel='icon'][data-project-favicon]",
            );

            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                link.dataset.projectFavicon = '1';
                document.head.appendChild(link);
            }

            link.href = projectAppearance.faviconUrl;
        }
    }, [projectAppearance]);

    return projectAppearance;
}

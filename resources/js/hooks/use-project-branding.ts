import { usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import type { ProjectAppearance } from '@/types/appearance';

/**
 * Applies shared project branding (primary color + favicon) to the document.
 */
export function useProjectBranding(): ProjectAppearance | undefined {
    const { projectAppearance } = usePage().props;

    useEffect(() => {
        if (!projectAppearance) {
            return;
        }

        if (projectAppearance.projectColor) {
            document.documentElement.style.setProperty(
                '--primary',
                projectAppearance.projectColor,
            );
        }

        if (projectAppearance.primaryForeground) {
            document.documentElement.style.setProperty(
                '--primary-foreground',
                projectAppearance.primaryForeground,
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

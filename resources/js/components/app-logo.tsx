import { usePage } from '@inertiajs/react';
import AppLogoIcon from '@/components/app-logo-icon';
import { useAppearance } from '@/hooks/use-appearance';

/**
 * Brand mark and application name for sidebar and header chrome.
 * Custom project logos render as a plain image; the default SVG keeps a
 * contrasting mark box so the icon stays readable on the sidebar.
 * @returns {JSX.Element}
 */
export default function AppLogo() {
    const { name, projectAppearance } = usePage().props;
    const { resolvedAppearance } = useAppearance();
    // ponytail: optional dark logo; fall back to light logo, then default mark
    const logoUrl =
        resolvedAppearance === 'dark'
            ? (projectAppearance?.logoDarkUrl ?? projectAppearance?.logoUrl)
            : projectAppearance?.logoUrl;

    return (
        <>
            {logoUrl ? (
                <img
                    src={logoUrl}
                    alt={name}
                    className="h-8 w-auto max-w-24 object-contain"
                />
            ) : (
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                    <AppLogoIcon className="size-5 fill-current text-white dark:text-black" />
                </div>
            )}
            <div className="ml-1 grid flex-1 text-left text-sm">
                <span className="mb-0.5 truncate leading-tight font-semibold">
                    {name}
                </span>
            </div>
        </>
    );
}

import { usePage } from '@inertiajs/react';
import AppLogoIcon from '@/components/app-logo-icon';
import { useAppearance } from '@/hooks/use-appearance';

/**
 * Brand mark and application name for sidebar and header chrome.
 * Custom project logos render as a plain image; the default mark is the
 * colored 3-tone Externa isometric (same teal fills as public/logo.svg).
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
                <div className="flex aspect-square size-8 items-center justify-center">
                    <AppLogoIcon className="size-7" />
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

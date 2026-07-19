import { Link } from '@inertiajs/react';
import AppLogoIcon from '@/components/app-logo-icon';
import { useAppearance } from '@/hooks/use-appearance';
import { useProjectBranding } from '@/hooks/use-project-branding';
import { home } from '@/routes';
import type { AuthLayoutProps } from '@/types';

/**
 * Centered auth layout with logo, title, and description above the form.
 * @param {AuthLayoutProps} props - Auth layout props.
 * @param {React.ReactNode} props.children - Auth form content.
 * @param {string} props.title - Page heading.
 * @param {string} props.description - Subheading shown below the title.
 * @returns {JSX.Element}
 */
export default function AuthSimpleLayout({
    children,
    title,
    description,
}: AuthLayoutProps) {
    const projectAppearance = useProjectBranding();
    const { resolvedAppearance } = useAppearance();
    // ponytail: optional dark logo; fall back to light logo, then default mark
    const logoUrl =
        resolvedAppearance === 'dark'
            ? (projectAppearance?.logoDarkUrl ?? projectAppearance?.logoUrl)
            : projectAppearance?.logoUrl;

    return (
        <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
            <div className="w-full max-w-sm">
                <div className="flex flex-col gap-8">
                    <div className="flex flex-col items-center gap-4">
                        <Link
                            href={home()}
                            className="flex flex-col items-center gap-2 font-medium"
                        >
                            <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-md">
                                {logoUrl ? (
                                    <img
                                        src={logoUrl}
                                        alt={title}
                                        className="size-9 object-contain"
                                    />
                                ) : (
                                    <AppLogoIcon className="size-9 fill-current text-[var(--foreground)] dark:text-white" />
                                )}
                            </div>
                            <span className="sr-only">{title}</span>
                        </Link>

                        <div className="space-y-2 text-center">
                            <h1 className="text-xl font-medium">{title}</h1>
                            <p className="text-center text-sm text-muted-foreground">
                                {description}
                            </p>
                        </div>
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}

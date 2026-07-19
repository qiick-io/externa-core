import { Link, router, usePage } from '@inertiajs/react';
import { Check, Languages, LogOut, Settings, SunMoon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { UserInfo } from '@/components/user-info';
import type { Appearance } from '@/hooks/use-appearance';
import { useAppearance } from '@/hooks/use-appearance';
import { useMobileNavigation } from '@/hooks/use-mobile-navigation';
import i18n from '@/lib/i18n';
import { logout } from '@/routes';
import { update as updateLocale } from '@/routes/locale';
import { edit } from '@/routes/profile';
import type { User } from '@/types';

type Props = {
    user: User;
};

const appearanceOptions: Appearance[] = ['light', 'dark', 'system'];

/**
 * Dropdown menu body for profile settings, language, appearance, and logout.
 */
export function UserMenuContent({ user }: Props) {
    const { t } = useTranslation();
    const cleanup = useMobileNavigation();
    const { locale, availableLocales } = usePage().props;
    const { appearance, updateAppearance } = useAppearance();

    /** Clears mobile nav state and Inertia page cache before logout. */
    const handleLogout = () => {
        cleanup();
        router.flushAll();
    };

    const handleLocaleChange = (next: string) => {
        if (next === locale) {
            return;
        }

        router.patch(
            updateLocale.url(),
            { locale: next },
            {
                preserveScroll: true,
                onSuccess: () => {
                    void i18n.changeLanguage(next);
                },
            },
        );
    };

    return (
        <>
            <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <UserInfo user={user} showEmail={true} />
                </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                    <Link
                        className="block w-full cursor-pointer"
                        href={edit()}
                        prefetch
                        onClick={cleanup}
                    >
                        <Settings className="mr-2" />
                        {t('userMenu.settings')}
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="cursor-pointer">
                        <Languages className="mr-2 size-4" />
                        {t('userMenu.language')}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        {Object.entries(availableLocales).map(
                            ([code, label]) => (
                                <DropdownMenuItem
                                    key={code}
                                    className="cursor-pointer"
                                    onSelect={() => handleLocaleChange(code)}
                                >
                                    <span className="flex-1">{label}</span>
                                    {locale === code ? (
                                        <Check className="size-4" />
                                    ) : null}
                                </DropdownMenuItem>
                            ),
                        )}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="cursor-pointer">
                        <SunMoon className="mr-2 size-4" />
                        {t('userMenu.appearance')}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        {appearanceOptions.map((mode) => (
                            <DropdownMenuItem
                                key={mode}
                                className="cursor-pointer"
                                onSelect={() => updateAppearance(mode)}
                            >
                                <span className="flex-1">
                                    {t(`settings.appearance.${mode}`)}
                                </span>
                                {appearance === mode ? (
                                    <Check className="size-4" />
                                ) : null}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
                <Link
                    className="block w-full cursor-pointer"
                    href={logout()}
                    as="button"
                    onClick={handleLogout}
                    data-test="logout-button"
                >
                    <LogOut className="mr-2" />
                    {t('userMenu.logOut')}
                </Link>
            </DropdownMenuItem>
        </>
    );
}

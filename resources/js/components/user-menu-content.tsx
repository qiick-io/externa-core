import { Link, router, usePage } from '@inertiajs/react';
import {
    Accessibility,
    Check,
    Languages,
    LogOut,
    Settings,
    SunMoon,
} from 'lucide-react';
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
import { useAccessibilityPreferences } from '@/hooks/use-accessibility-preferences';
import type { Appearance } from '@/hooks/use-appearance';
import { useAppearance } from '@/hooks/use-appearance';
import { useMobileNavigation } from '@/hooks/use-mobile-navigation';
import i18n from '@/lib/i18n';
import { logout } from '@/routes';
import { update as updateLocale } from '@/routes/locale';
import { edit } from '@/routes/profile';
import { resetChatStore } from '@/stores/chat/reset';
import type { User } from '@/types';

type Props = {
    user: User;
};

const appearanceOptions: Appearance[] = ['light', 'dark', 'system'];

/**
 * Dropdown menu body for profile settings, language, appearance, accessibility, and logout.
 */
export function UserMenuContent({ user }: Props) {
    const { t } = useTranslation();
    const cleanup = useMobileNavigation();
    const { locale, availableLocales } = usePage().props;
    const { appearance, updateAppearance } = useAppearance();
    const {
        highContrastEnabled,
        reduceMotionEnabled,
        enabledCount,
        toggleHighContrast,
        toggleReduceMotion,
    } = useAccessibilityPreferences();

    /** Clears mobile nav state, chat session cache, and Inertia page cache before logout. */
    const handleLogout = () => {
        cleanup();
        resetChatStore();
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

    const accessibilitySummary =
        enabledCount === 0
            ? t('userMenu.accessibilityOff')
            : t('userMenu.accessibilityOnCount', { count: enabledCount });

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
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger
                        className="cursor-pointer"
                        data-test="accessibility-menu"
                    >
                        <Accessibility className="mr-2 size-4" />
                        <span className="flex-1">
                            {t('userMenu.accessibility')}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                            {accessibilitySummary}
                        </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        <DropdownMenuItem
                            className="cursor-pointer"
                            data-test="accessibility-high-contrast"
                            onSelect={(event) => {
                                event.preventDefault();
                                toggleHighContrast();
                            }}
                        >
                            <span className="flex-1">
                                {t('userMenu.highContrast')}
                            </span>
                            {highContrastEnabled ? (
                                <Check className="size-4" />
                            ) : null}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="cursor-pointer"
                            data-test="accessibility-reduce-motion"
                            onSelect={(event) => {
                                event.preventDefault();
                                toggleReduceMotion();
                            }}
                        >
                            <span className="flex-1">
                                {t('userMenu.reduceMotion')}
                            </span>
                            {reduceMotionEnabled ? (
                                <Check className="size-4" />
                            ) : null}
                        </DropdownMenuItem>
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

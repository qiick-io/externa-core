import type { LucideIcon } from 'lucide-react';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Appearance } from '@/hooks/use-appearance';
import { useAppearance } from '@/hooks/use-appearance';
import { cn } from '@/lib/utils';

/**
 * Segmented control for light, dark, and system appearance preference.
 */
export default function AppearanceToggleTab({
    className = '',
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    const { t } = useTranslation();
    const { appearance, updateAppearance } = useAppearance();

    const tabs: { value: Appearance; icon: LucideIcon; label: string }[] = [
        {
            value: 'light',
            icon: Sun,
            label: t('settings.appearance.light'),
        },
        { value: 'dark', icon: Moon, label: t('settings.appearance.dark') },
        {
            value: 'system',
            icon: Monitor,
            label: t('settings.appearance.system'),
        },
    ];

    return (
        <div className={cn(className)} {...props}>
            <ToggleGroup
                type="single"
                value={appearance}
                onValueChange={(value) => {
                    if (
                        value === 'light' ||
                        value === 'dark' ||
                        value === 'system'
                    ) {
                        updateAppearance(value);
                    }
                }}
                variant="outline"
                className="bg-muted"
            >
                {tabs.map(({ value, icon: Icon, label }) => (
                    <ToggleGroupItem
                        key={value}
                        value={value}
                        aria-label={label}
                        className="gap-2 px-3.5"
                    >
                        <Icon className="size-4" aria-hidden="true" />
                        <span>{label}</span>
                    </ToggleGroupItem>
                ))}
            </ToggleGroup>
        </div>
    );
}

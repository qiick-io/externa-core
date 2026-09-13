import { Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Drawer,
    DrawerBody,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerNested,
    DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { useCan } from '@/hooks/use-can';
import {
    AI_ACTION_PRESETS,
    filterAiActionPresets,
} from '@/lib/ai-action-presets';
import type {
    AiActionPreset,
    AiActionPresetCategory,
} from '@/lib/ai-action-presets';
import { cn } from '@/lib/utils';

const CATEGORY_ORDER: AiActionPresetCategory[] = [
    'common',
    'data',
    'files',
    'admin',
    'advanced',
];

type AiActionPresetsDrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (prompt: string) => void;
    /** Use when opening from another Drawer (e.g. AI FAB). */
    nested?: boolean;
};

/**
 * Drawer listing saved AI action presets.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function AiActionPresetsDrawer({
    open,
    onOpenChange,
    onSelect,
    nested = false,
}: AiActionPresetsDrawerProps) {
    const { t } = useTranslation();
    const DrawerRoot = nested ? DrawerNested : Drawer;
    const { can } = useCan();
    const [search, setSearch] = useState('');
    const [pendingDestructive, setPendingDestructive] =
        useState<AiActionPreset | null>(null);

    const visiblePresets = useMemo(
        () => filterAiActionPresets(AI_ACTION_PRESETS, can),
        [can],
    );

    const localizedPresets = useMemo(
        () =>
            visiblePresets.map((preset) => ({
                ...preset,
                title: t(`ai.presets.${preset.id}.title`, {
                    defaultValue: preset.title,
                }),
                description: t(`ai.presets.${preset.id}.description`, {
                    defaultValue: preset.description,
                }),
            })),
        [t, visiblePresets],
    );

    const grouped = useMemo(() => {
        const query = search.trim().toLowerCase();
        const filtered = localizedPresets.filter((preset) => {
            if (query === '') {
                return true;
            }

            return (
                preset.title.toLowerCase().includes(query) ||
                preset.description.toLowerCase().includes(query) ||
                preset.prompt.toLowerCase().includes(query)
            );
        });

        return CATEGORY_ORDER.map((category) => ({
            category,
            label: t(`ai.categories.${category}`),
            presets: filtered.filter((preset) => preset.category === category),
        })).filter((group) => group.presets.length > 0);
    }, [search, localizedPresets, t]);

    const applyPreset = (preset: AiActionPreset): void => {
        onSelect(preset.prompt);
        setPendingDestructive(null);
        onOpenChange(false);
        setSearch('');
    };

    const handlePresetClick = (preset: AiActionPreset): void => {
        if (preset.destructive) {
            setPendingDestructive(preset);

            return;
        }

        applyPreset(preset);
    };

    const pendingTitle = pendingDestructive
        ? t(`ai.presets.${pendingDestructive.id}.title`, {
              defaultValue: pendingDestructive.title,
          })
        : '';

    return (
        <>
            <DrawerRoot
                direction="right"
                open={open}
                onOpenChange={(nextOpen) => {
                    onOpenChange(nextOpen);

                    if (!nextOpen) {
                        setSearch('');
                        setPendingDestructive(null);
                    }
                }}
            >
                <DrawerContent>
                    <DrawerHeader>
                        <DrawerTitle className="flex items-center gap-2">
                            <Sparkles className="size-4" />
                            {t('ai.drawer.title')}
                        </DrawerTitle>
                        <DrawerDescription>
                            {t('ai.drawer.description')}
                        </DrawerDescription>
                    </DrawerHeader>
                    <DrawerBody className="gap-4">
                        <div className="relative">
                            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                placeholder={t('ai.drawer.searchPlaceholder')}
                                className="pl-8"
                                aria-label={t('ai.drawer.searchAria')}
                            />
                        </div>

                        {grouped.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                {t('ai.drawer.empty')}
                            </p>
                        ) : (
                            grouped.map((group) => (
                                <section
                                    key={group.category}
                                    className="space-y-2"
                                >
                                    <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                        {group.label}
                                    </h3>
                                    <ul className="space-y-1.5">
                                        {group.presets.map((preset) => (
                                            <li key={preset.id}>
                                                <button
                                                    type="button"
                                                    className={cn(
                                                        'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                                                        'hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                                    )}
                                                    onClick={() =>
                                                        handlePresetClick(
                                                            preset,
                                                        )
                                                    }
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <span className="text-sm font-medium">
                                                            {preset.title}
                                                        </span>
                                                        {preset.destructive ? (
                                                            <span className="shrink-0 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                                                                {t(
                                                                    'ai.drawer.destructive',
                                                                )}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        {preset.description}
                                                    </p>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ))
                        )}
                    </DrawerBody>
                </DrawerContent>
            </DrawerRoot>

            <Dialog
                open={pendingDestructive !== null}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) {
                        setPendingDestructive(null);
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('ai.drawer.confirmTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('ai.drawer.confirmDescription', {
                                title: pendingTitle,
                            })}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setPendingDestructive(null)}
                        >
                            {t('ai.drawer.confirmCancel')}
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() => {
                                if (pendingDestructive) {
                                    applyPreset(pendingDestructive);
                                }
                            }}
                        >
                            {t('ai.drawer.confirmInsert')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

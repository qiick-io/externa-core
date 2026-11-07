import { Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
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
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerNested,
    DrawerTitle,
} from '@/components/ui/drawer';
import { useCan } from '@/hooks/use-can';
import {
    AI_ACTION_PRESETS,
    filterAiActionPresets,
} from '@/lib/ai-action-presets';
import type {
    AiActionPreset,
    AiActionPresetCategory,
} from '@/lib/ai-action-presets';

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
                            <Sparkles className="size-4 text-ai" />
                            {t('ai.drawer.title')}
                        </DrawerTitle>
                        <DrawerDescription>
                            {t('ai.drawer.description')}
                        </DrawerDescription>
                    </DrawerHeader>
                    <Command
                        shouldFilter={false}
                        className="min-h-0 flex-1 rounded-none bg-transparent"
                    >
                        <CommandInput
                            value={search}
                            onValueChange={setSearch}
                            placeholder={t('ai.drawer.searchPlaceholder')}
                            aria-label={t('ai.drawer.searchAria')}
                        />
                        <CommandList
                            label={t('ai.drawer.title')}
                            className="max-h-none flex-1 px-3 py-2"
                        >
                            <CommandEmpty>{t('ai.drawer.empty')}</CommandEmpty>
                            {grouped.map((group) => (
                                <CommandGroup
                                    key={group.category}
                                    heading={group.label}
                                >
                                    {group.presets.map((preset) => (
                                        <CommandItem
                                            key={preset.id}
                                            value={preset.id}
                                            className="flex-col items-stretch gap-0.5 py-2"
                                            onSelect={() =>
                                                handlePresetClick(preset)
                                            }
                                        >
                                            <span className="flex items-start justify-between gap-2">
                                                <span className="font-medium">
                                                    {preset.title}
                                                </span>
                                                {preset.destructive ? (
                                                    <Badge variant="destructive">
                                                        {t(
                                                            'ai.drawer.destructive',
                                                        )}
                                                    </Badge>
                                                ) : null}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {preset.description}
                                            </span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            ))}
                        </CommandList>
                    </Command>
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

import { Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCan } from '@/hooks/use-can';
import {
    AI_ACTION_PRESET_CATEGORY_LABELS,
    AI_ACTION_PRESETS,
    filterAiActionPresets,
    type AiActionPreset,
    type AiActionPresetCategory,
} from '@/lib/ai-action-presets';
import { cn } from '@/lib/utils';

const CATEGORY_ORDER: AiActionPresetCategory[] = [
    'comuni',
    'dati',
    'file',
    'admin',
    'avanzate',
];

type AiActionPresetsDrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (prompt: string) => void;
    /** Use when opening from another Drawer (e.g. AI FAB). */
    nested?: boolean;
};

export function AiActionPresetsDrawer({
    open,
    onOpenChange,
    onSelect,
    nested = false,
}: AiActionPresetsDrawerProps) {
    const DrawerRoot = nested ? DrawerNested : Drawer;
    const { can } = useCan();
    const [search, setSearch] = useState('');
    const [pendingDestructive, setPendingDestructive] =
        useState<AiActionPreset | null>(null);

    const visiblePresets = useMemo(
        () => filterAiActionPresets(AI_ACTION_PRESETS, can),
        [can],
    );

    const grouped = useMemo(() => {
        const query = search.trim().toLowerCase();
        const filtered = visiblePresets.filter((preset) => {
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
            label: AI_ACTION_PRESET_CATEGORY_LABELS[category],
            presets: filtered.filter((preset) => preset.category === category),
        })).filter((group) => group.presets.length > 0);
    }, [search, visiblePresets]);

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
                            Azioni utili
                        </DrawerTitle>
                        <DrawerDescription>
                            Scegli un preset: il testo viene inserito in chat,
                            senza inviare.
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
                                placeholder="Cerca azioni…"
                                className="pl-8"
                                aria-label="Cerca azioni"
                            />
                        </div>

                        {grouped.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Nessuna azione disponibile con i tuoi permessi.
                            </p>
                        ) : (
                            grouped.map((group) => (
                                <section key={group.category} className="space-y-2">
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
                                                        handlePresetClick(preset)
                                                    }
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <span className="text-sm font-medium">
                                                            {preset.title}
                                                        </span>
                                                        {preset.destructive ? (
                                                            <span className="shrink-0 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                                                                Distruttivo
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
                        <DialogTitle>Inserire azione distruttiva?</DialogTitle>
                        <DialogDescription>
                            «{pendingDestructive?.title}» può eliminare o
                            modificare molti dati. Il testo verrà solo inserito
                            nel composer: potrai rivederlo prima di inviare.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setPendingDestructive(null)}
                        >
                            Annulla
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
                            Inserisci nel composer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

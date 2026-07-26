import { router } from '@inertiajs/react';
import { PackagePlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { fieldTypeLabel } from '@/lib/collection-field-types';
import { cn } from '@/lib/utils';

export type FieldPackSummary = {
    key: string;
    label: string;
    description: string;
    fields: Array<{
        name: string;
        type: string;
        translatable: boolean;
    }>;
};

type ApplyFieldPackDialogProps = {
    collectionId: number;
    fieldPacks: FieldPackSummary[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

/**
 * Preview + apply a registered field pack onto the collection schema.
 */
export function ApplyFieldPackDialog({
    collectionId,
    fieldPacks,
    open,
    onOpenChange,
}: ApplyFieldPackDialogProps) {
    const { t } = useTranslation();
    const [selectedKey, setSelectedKey] = useState<string | null>(
        fieldPacks[0]?.key ?? null,
    );
    const [applying, setApplying] = useState(false);

    const selected =
        fieldPacks.find((pack) => pack.key === selectedKey) ??
        fieldPacks[0] ??
        null;

    const apply = (): void => {
        if (selected === null) {
            return;
        }

        setApplying(true);
        router.post(
            FieldController.applyPack.url({
                collection: collectionId,
                pack: selected.key,
            }),
            {},
            {
                preserveScroll: true,
                onFinish: () => {
                    setApplying(false);
                    onOpenChange(false);
                },
            },
        );
    };

    const packLabel = (pack: FieldPackSummary): string =>
        t(`collections.packs.fieldPacks.${pack.key}.label`, {
            defaultValue: pack.label,
        });

    const packDescription = (pack: FieldPackSummary): string =>
        t(`collections.packs.fieldPacks.${pack.key}.description`, {
            defaultValue: pack.description,
        });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {t('collections.packs.addFieldPack')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('collections.packs.addFieldPackDescription')}
                    </DialogDescription>
                </DialogHeader>

                {fieldPacks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {t('collections.packs.noFieldPacks')}
                    </p>
                ) : (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            {fieldPacks.map((pack) => (
                                <button
                                    key={pack.key}
                                    type="button"
                                    onClick={() => setSelectedKey(pack.key)}
                                    className={cn(
                                        'rounded-lg border px-3 py-2.5 text-left transition-colors',
                                        selected?.key === pack.key
                                            ? 'border-primary bg-primary/5'
                                            : 'border-sidebar-border/70 hover:bg-muted/40 dark:border-sidebar-border',
                                    )}
                                >
                                    <p className="font-medium">
                                        {packLabel(pack)}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {packDescription(pack)}
                                    </p>
                                </button>
                            ))}
                        </div>

                        {selected !== null && (
                            <div>
                                <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                    {t('collections.packs.previewFields', {
                                        count: selected.fields.length,
                                    })}
                                </p>
                                <ul className="divide-y rounded-lg border border-sidebar-border/70 dark:border-sidebar-border">
                                    {selected.fields.map((field) => (
                                        <li
                                            key={field.name}
                                            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                                        >
                                            <span className="font-mono text-xs">
                                                {field.name}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {fieldTypeLabel(field.type)}
                                                {field.translatable
                                                    ? t(
                                                          'collections.translatableSuffix',
                                                      )
                                                    : ''}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={applying}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        type="button"
                        onClick={apply}
                        disabled={selected === null || applying}
                    >
                        <PackagePlus className="size-4" />
                        {applying
                            ? t('collections.packs.applying')
                            : t('collections.packs.applyPack')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

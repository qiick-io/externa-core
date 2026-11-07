import { router } from '@inertiajs/react';
import { PackagePlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import { PackChoiceGroup } from '@/components/collections/pack-choice-group';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Item, ItemGroup } from '@/components/ui/item';
import { fieldTypeLabel } from '@/lib/collection-field-types';

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
                        <PackChoiceGroup
                            idPrefix="field-pack"
                            ariaLabel={t('collections.packs.addFieldPack')}
                            packs={fieldPacks.map((pack) => ({
                                key: pack.key,
                                label: packLabel(pack),
                                description: packDescription(pack),
                            }))}
                            value={selected?.key ?? null}
                            onValueChange={setSelectedKey}
                        />

                        {selected !== null && (
                            <div>
                                <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                    {t('collections.packs.previewFields', {
                                        count: selected.fields.length,
                                    })}
                                </p>
                                <ItemGroup className="divide-y rounded-lg border border-sidebar-border/70 dark:border-sidebar-border">
                                    {selected.fields.map((field) => (
                                        <Item
                                            key={field.name}
                                            role="listitem"
                                            size="sm"
                                            className="justify-between rounded-none"
                                        >
                                            <span className="font-mono text-xs">
                                                {field.name}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {fieldTypeLabel(field.type, t)}
                                                {field.translatable
                                                    ? t(
                                                          'collections.translatableSuffix',
                                                      )
                                                    : ''}
                                            </span>
                                        </Item>
                                    ))}
                                </ItemGroup>
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

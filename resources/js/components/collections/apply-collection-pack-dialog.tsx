import { router } from '@inertiajs/react';
import { PackagePlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ContentCollectionController from '@/actions/App/Http/Controllers/Collections/ContentCollectionController';
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

export type CollectionPackSummary = {
    key: string;
    label: string;
    description: string;
    collection: {
        name: string;
        slug: string;
        is_singleton: boolean;
    };
    requires: string[];
    fields: Array<{
        name: string;
        type: string;
        translatable: boolean;
    }>;
    relations: Array<{
        field_name: string;
        type: string;
        related_pack?: string;
        related_slug?: string;
        display_field?: string;
    }>;
};

type ApplyCollectionPackDialogProps = {
    collectionPacks: CollectionPackSummary[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

/**
 * Preview + apply a registered collection starter pack.
 */
export function ApplyCollectionPackDialog({
    collectionPacks,
    open,
    onOpenChange,
}: ApplyCollectionPackDialogProps) {
    const { t } = useTranslation();
    const [selectedKey, setSelectedKey] = useState<string | null>(
        collectionPacks[0]?.key ?? null,
    );
    const [applying, setApplying] = useState(false);

    const selected =
        collectionPacks.find((pack) => pack.key === selectedKey) ??
        collectionPacks[0] ??
        null;

    const apply = (): void => {
        if (selected === null) {
            return;
        }

        setApplying(true);
        router.post(
            ContentCollectionController.applyPack.url(selected.key),
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

    const packLabel = (pack: CollectionPackSummary): string =>
        t(`collections.packs.collectionPacks.${pack.key}.label`, {
            defaultValue: pack.label,
        });

    const packDescription = (pack: CollectionPackSummary): string =>
        t(`collections.packs.collectionPacks.${pack.key}.description`, {
            defaultValue: pack.description,
        });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {t('collections.packs.createFromPack')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('collections.packs.createFromPackDescription')}
                    </DialogDescription>
                </DialogHeader>

                {collectionPacks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {t('collections.packs.noCollectionPacks')}
                    </p>
                ) : (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            {collectionPacks.map((pack) => (
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
                            <div className="flex flex-col gap-3">
                                <div>
                                    <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                        {t('collections.packs.collection')}
                                    </p>
                                    <p className="text-sm">
                                        <span className="font-medium">
                                            {selected.collection.name}
                                        </span>
                                        <span className="text-muted-foreground">
                                            {' '}
                                            · {selected.collection.slug}
                                        </span>
                                    </p>
                                </div>

                                {selected.requires.length > 0 && (
                                    <div>
                                        <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                            {t('collections.packs.requires')}
                                        </p>
                                        <p className="font-mono text-xs text-muted-foreground">
                                            {selected.requires.join(', ')}
                                        </p>
                                    </div>
                                )}

                                <div>
                                    <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                        {t('collections.packs.fieldsCount', {
                                            count: selected.fields.length,
                                        })}
                                        {selected.relations.length > 0
                                            ? t(
                                                  'collections.packs.relationsSuffix',
                                                  {
                                                      count: selected.relations
                                                          .length,
                                                  },
                                              )
                                            : ''}
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
                                        {selected.relations.map((relation) => (
                                            <li
                                                key={relation.field_name}
                                                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                                            >
                                                <span className="font-mono text-xs">
                                                    {relation.field_name}
                                                </span>
                                                <span className="text-muted-foreground">
                                                    {fieldTypeLabel(
                                                        relation.type,
                                                    )}
                                                    {relation.related_pack
                                                        ? ` → ${relation.related_pack}`
                                                        : ''}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
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
                            ? t('collections.packs.creating')
                            : t('collections.packs.createFromPack')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

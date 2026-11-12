import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ItemRevisionCompareModal } from '@/components/collections/item-revision-compare-modal';
import type { RevisionSnapshot } from '@/components/collections/item-revision-compare-modal';
import { ItemRevisionsDrawer } from '@/components/collections/item-revisions-drawer';
import type { CollectionView } from '@/types/collections';

/**
 * Revisions of a saved item: the drawer that lists them and the compare
 * modal that diffs the chosen revision against the previous one and the
 * current data, and can apply its values to the form.
 */
export function ItemRevisionsPanel({
    collection,
    itemId,
    locales,
    relatedCollections,
    latestData,
    open,
    onOpenChange,
    canRestore,
    canApplyToForm,
    onApplyRevision,
}: {
    collection: CollectionView;
    itemId: number;
    locales: string[];
    relatedCollections: { id: number; name: string; slug: string }[];
    /** Data the revision is compared with (the version on screen). */
    latestData: Record<string, unknown>;
    open: boolean;
    onOpenChange: Dispatch<SetStateAction<boolean>>;
    /** Whether the user may restore revisions at all. */
    canRestore: boolean;
    /** Whether the form is editable, so a revision can be applied to it. */
    canApplyToForm: boolean;
    onApplyRevision: (values: Record<string, unknown>) => void;
}) {
    const [compareRevision, setCompareRevision] =
        useState<RevisionSnapshot | null>(null);
    const [allRevisions, setAllRevisions] = useState<RevisionSnapshot[]>([]);

    return (
        <>
            <ItemRevisionsDrawer
                open={open}
                onOpenChange={onOpenChange}
                collectionId={collection.id}
                itemId={itemId}
                canRestore={canRestore}
                onSelectRevision={(revision, all) => {
                    setAllRevisions(all);
                    setCompareRevision(revision);
                    onOpenChange(false);
                }}
            />

            <ItemRevisionCompareModal
                open={compareRevision !== null}
                onOpenChange={(isOpen) => {
                    if (!isOpen) {
                        setCompareRevision(null);
                    }
                }}
                collectionId={collection.id}
                fields={collection.fields}
                locales={locales}
                formLayout={collection.form_layout}
                relatedCollections={relatedCollections}
                latestData={latestData}
                revision={compareRevision}
                previousRevision={
                    compareRevision
                        ? (allRevisions[
                              allRevisions.findIndex(
                                  (row) => row.id === compareRevision.id,
                              ) + 1
                          ] ?? null)
                        : null
                }
                canRestore={canRestore && canApplyToForm}
                onApply={onApplyRevision}
            />
        </>
    );
}

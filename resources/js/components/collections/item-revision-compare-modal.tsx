import { useMemo, useState } from 'react';
import { DynamicItemFields } from '@/components/collections/dynamic-item-fields';
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { isLayoutGroupType } from '@/lib/collection-field-groups';
import type { RelatedCollectionOption } from '@/lib/collection-field-types';
import { differingFieldNames, stableJson } from '@/lib/revision-diff';
import type { CollectionFieldRow } from '@/types';

export type RevisionSnapshot = {
    id: number;
    user: { id: number; name: string } | null;
    created_at: string | null;
    meta: Record<string, unknown> | null;
    data: Record<string, unknown>;
    summary?: string;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    collectionId: number;
    fields: CollectionFieldRow[];
    locales: string[];
    formLayout?: Record<string, unknown> | null;
    relatedCollections?: RelatedCollectionOption[];
    /** Current item values (Latest / Published). */
    latestData: Record<string, unknown>;
    revision: RevisionSnapshot | null;
    /** Previous revision chronologically (older than selected), if any. */
    previousRevision: RevisionSnapshot | null;
    canRestore?: boolean;
    onApply: (values: Record<string, unknown>) => void;
};

/**
 * Giant side-by-side form compare modal (Directus-like soft restore).
 */
export function ItemRevisionCompareModal({
    open,
    onOpenChange,
    collectionId,
    fields,
    locales,
    formLayout,
    relatedCollections = [],
    latestData,
    revision,
    previousRevision,
    canRestore = false,
    onApply,
}: Props) {
    const [compareTo, setCompareTo] = useState<'latest' | 'previous'>('latest');
    const [showDiffOnly, setShowDiffOnly] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const leftData = useMemo(() => {
        if (compareTo === 'previous' && previousRevision) {
            return previousRevision.data;
        }

        return latestData;
    }, [compareTo, previousRevision, latestData]);

    const rightData = useMemo(() => revision?.data ?? {}, [revision]);
    const leftKey = useMemo(
        () => stableJson(leftData).slice(0, 64),
        [leftData],
    );
    const rightKey = useMemo(
        () => stableJson(rightData).slice(0, 64),
        [rightData],
    );

    const dataFieldNames = useMemo(
        () =>
            fields
                .filter((field) => !isLayoutGroupType(field.type))
                .map((field) => field.name),
        [fields],
    );

    const diffNames = useMemo(
        () => differingFieldNames(leftData, rightData, dataFieldNames),
        [leftData, rightData, dataFieldNames],
    );

    const diffSet = useMemo(() => new Set(diffNames), [diffNames]);

    const visibleFields = useMemo(() => {
        if (!showDiffOnly) {
            return fields;
        }

        return fields.filter(
            (field) => isLayoutGroupType(field.type) || diffSet.has(field.name),
        );
    }, [fields, showDiffOnly, diffSet]);

    const canApply = canRestore && compareTo === 'latest' && revision !== null;

    const leftLabel = compareTo === 'previous' ? 'Previous revision' : 'Latest';

    const toggleField = (name: string): void => {
        setSelected((prev) => {
            const next = new Set(prev);

            if (next.has(name)) {
                next.delete(name);
            } else {
                next.add(name);
            }

            return next;
        });
    };

    const allDiffsSelected =
        diffNames.length > 0 && diffNames.every((name) => selected.has(name));

    const toggleSelectAllDiffs = (): void => {
        if (allDiffsSelected) {
            setSelected((prev) => {
                const next = new Set(prev);

                for (const name of diffNames) {
                    next.delete(name);
                }

                return next;
            });

            return;
        }

        setSelected(new Set(diffNames));
    };

    const handleApply = (): void => {
        if (!canApply || !revision) {
            return;
        }

        const keys = selected.size > 0 ? Array.from(selected) : [...diffNames];
        const values: Record<string, unknown> = {};

        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(revision.data, key)) {
                values[key] = revision.data[key];
            } else {
                values[key] = null;
            }
        }

        onApply(values);
        onOpenChange(false);
    };

    const editedBy = revision?.user?.name ?? 'System';
    const editedAt = revision?.created_at
        ? new Date(revision.created_at).toLocaleString()
        : '—';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                data-test="item-revision-compare-modal"
                className="flex h-[90vh] max-h-[90vh] w-[90vw] max-w-[90vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[90vw]"
            >
                <DialogHeader className="shrink-0 border-b px-6 py-4 text-left">
                    <DialogTitle>Compare revision</DialogTitle>
                    <DialogDescription>
                        Edited by {editedBy} · {editedAt}
                    </DialogDescription>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                className="size-3.5 rounded border"
                                checked={showDiffOnly}
                                onChange={(e) =>
                                    setShowDiffOnly(e.target.checked)
                                }
                                data-test="show-differences-only"
                            />
                            Show differences only
                        </label>
                        <div className="flex items-center gap-3">
                            {canApply ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={toggleSelectAllDiffs}
                                    disabled={diffNames.length === 0}
                                    data-test="select-all-differences"
                                >
                                    {allDiffsSelected
                                        ? 'Deselect all differences'
                                        : 'Select all differences'}
                                </Button>
                            ) : null}
                            <span className="text-xs text-muted-foreground">
                                {diffNames.length} difference
                                {diffNames.length === 1 ? '' : 's'}
                            </span>
                        </div>
                    </div>
                </DialogHeader>

                {/* One scroll parent so Latest + Item Revision move together */}
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="grid grid-cols-1 divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
                        <div className="min-w-0">
                            <div className="sticky top-0 z-10 border-b bg-muted px-4 py-2 text-sm font-medium">
                                {leftLabel}
                            </div>
                            <div className="p-4">
                                {open ? (
                                    <DynamicItemFields
                                        key={`left-${compareTo}-${revision?.id ?? 0}-${leftKey}`}
                                        variant="plain"
                                        collectionId={collectionId}
                                        fields={visibleFields}
                                        locales={locales}
                                        defaults={leftData}
                                        relatedCollections={relatedCollections}
                                        formLayout={formLayout}
                                        forceReadonly
                                        highlightFields={diffSet}
                                    />
                                ) : null}
                            </div>
                        </div>
                        <div className="min-w-0">
                            <div className="sticky top-0 z-10 border-b bg-muted px-4 py-2 text-sm font-medium">
                                Item Revision
                            </div>
                            <div className="p-4">
                                {open && revision ? (
                                    <DynamicItemFields
                                        key={`right-${revision.id}-${rightKey}`}
                                        variant="plain"
                                        collectionId={collectionId}
                                        fields={visibleFields}
                                        locales={locales}
                                        defaults={rightData}
                                        relatedCollections={relatedCollections}
                                        formLayout={formLayout}
                                        forceReadonly
                                        highlightFields={diffSet}
                                        selectDiffFields={
                                            canApply ? selected : null
                                        }
                                        onToggleDiffField={
                                            canApply ? toggleField : undefined
                                        }
                                    />
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="shrink-0 items-center border-t px-6 py-4 sm:justify-between">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">
                            Comparing to
                        </span>
                        <Select
                            value={compareTo}
                            onValueChange={(value) => {
                                if (
                                    value === 'latest' ||
                                    value === 'previous'
                                ) {
                                    setCompareTo(value);
                                    setSelected(new Set());
                                }
                            }}
                        >
                            <SelectTrigger
                                size="sm"
                                className="h-8 w-auto border-0 bg-transparent px-1.5 shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent dark:hover:bg-muted/40"
                                data-test="compare-to-select"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="latest">Latest</SelectItem>
                                <SelectItem
                                    value="previous"
                                    disabled={!previousRevision}
                                >
                                    Previous
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        {canRestore ? (
                            <Button
                                type="button"
                                disabled={!canApply || diffNames.length === 0}
                                onClick={handleApply}
                                data-test="revision-apply"
                            >
                                Apply
                            </Button>
                        ) : null}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

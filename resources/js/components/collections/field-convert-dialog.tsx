import { router } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FieldConvertController from '@/actions/App/Http/Controllers/Collections/FieldConvertController';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    NativeSelect,
    NativeSelectOption,
} from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { fieldTypeLabel } from '@/lib/collection-field-types';
import { toast } from '@/lib/toast';
import type { CollectionFieldRow } from '@/types';

type ConvertPreview = {
    supported: boolean;
    dry_run: boolean;
    applied: boolean;
    error: string | null;
    counts: {
        ok: number;
        unchanged: number;
        failed: number;
        skipped: number;
        with_draft: number;
    };
    items: Array<{
        item_id: number;
        status: string;
        reason: string | null;
        has_draft: boolean;
    }>;
};

type FieldConvertDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    collectionId: number;
    field: CollectionFieldRow;
};

/**
 * Confirm + dry-run UI for converting a field that already has content (#220).
 */
export function FieldConvertDialog({
    open,
    onOpenChange,
    collectionId,
    field,
}: FieldConvertDialogProps) {
    const { t } = useTranslation();
    const [targets, setTargets] = useState<string[]>([]);
    const [toType, setToType] = useState(field.type);
    const [toTranslatable, setToTranslatable] = useState(field.translatable);
    const [preview, setPreview] = useState<ConvertPreview | null>(null);
    const [loading, setLoading] = useState(false);
    const [converting, setConverting] = useState(false);
    const [previousOpenState, setPreviousOpenState] = useState({
        open,
        collectionId,
        field,
    });

    // Reset the choices during render when the dialog opens or targets another
    // field (React's "adjust state on prop change" pattern).
    if (
        previousOpenState.open !== open ||
        previousOpenState.collectionId !== collectionId ||
        previousOpenState.field !== field
    ) {
        setPreviousOpenState({ open, collectionId, field });

        if (open) {
            setToType(field.type);
            setToTranslatable(field.translatable);
            setPreview(null);
        }
    }

    useEffect(() => {
        if (!open) {
            return;
        }

        const url = FieldConvertController.convertTargets.url({
            collection: collectionId,
            field: field.id,
        });

        void fetch(url, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error('targets');
                }

                return response.json() as Promise<{ targets: string[] }>;
            })
            .then((payload) => {
                setTargets(payload.targets ?? []);

                if (
                    payload.targets?.length &&
                    !payload.targets.includes(field.type)
                ) {
                    setToType(payload.targets[0] ?? field.type);
                }
            })
            .catch(() => {
                toast.error(t('collections.convert.loadTargetsFailed'));
            });
    }, [open, collectionId, field, t]);

    const fetchPreview = async (): Promise<void> => {
        setLoading(true);

        try {
            const token = document
                .querySelector('meta[name="csrf-token"]')
                ?.getAttribute('content');
            const response = await fetch(
                FieldConvertController.convert.url({
                    collection: collectionId,
                    field: field.id,
                }),
                {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': token ?? '',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    body: JSON.stringify({
                        type: toType,
                        translatable: toTranslatable,
                        dry_run: true,
                        sync: true,
                    }),
                },
            );
            const payload = (await response.json()) as ConvertPreview;
            setPreview(payload);

            if (payload.error) {
                toast.error(payload.error);
            }
        } catch {
            toast.error(t('collections.convert.previewFailed'));
        } finally {
            setLoading(false);
        }
    };

    const applyConvert = async (): Promise<void> => {
        setConverting(true);

        try {
            const token = document
                .querySelector('meta[name="csrf-token"]')
                ?.getAttribute('content');
            const response = await fetch(
                FieldConvertController.convert.url({
                    collection: collectionId,
                    field: field.id,
                }),
                {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': token ?? '',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    body: JSON.stringify({
                        type: toType,
                        translatable: toTranslatable,
                        dry_run: false,
                        sync: true,
                    }),
                },
            );
            const payload = (await response.json()) as ConvertPreview & {
                queued?: boolean;
            };

            if (!response.ok || payload.error) {
                toast.error(
                    payload.error ?? t('collections.convert.convertFailed'),
                );
                setPreview(payload);

                return;
            }

            toast.success(
                payload.applied
                    ? t('collections.convert.success')
                    : t('collections.convert.queued'),
            );
            onOpenChange(false);
            router.reload();
        } catch {
            toast.error(t('collections.convert.convertFailed'));
        } finally {
            setConverting(false);
        }
    };

    const canApply =
        preview !== null &&
        preview.supported &&
        preview.error === null &&
        preview.counts.failed === 0;

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="max-w-lg">
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {t('collections.convert.title', { name: field.name })}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {t('collections.convert.description')}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                        <Label htmlFor="field-convert-type">
                            {t('collections.convert.targetType')}
                        </Label>
                        <NativeSelect
                            id="field-convert-type"
                            value={toType}
                            onChange={(event) => {
                                setToType(event.target.value);
                                setPreview(null);
                            }}
                            className="w-full"
                        >
                            {[
                                field.type,
                                ...targets.filter(
                                    (type) => type !== field.type,
                                ),
                            ].map((type) => (
                                <NativeSelectOption key={type} value={type}>
                                    {fieldTypeLabel(type, t)}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <div className="grid gap-1">
                            <Label htmlFor="field-convert-translatable">
                                {t('collections.translatable')}
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                {t('collections.convert.translatableHint')}
                            </p>
                        </div>
                        <Switch
                            id="field-convert-translatable"
                            checked={toTranslatable}
                            onCheckedChange={(checked) => {
                                setToTranslatable(checked);
                                setPreview(null);
                            }}
                        />
                    </div>

                    {preview ? (
                        <div className="rounded-md border bg-muted/30 p-3 text-sm">
                            <p>
                                {t('collections.convert.previewSummary', {
                                    ok: preview.counts.ok,
                                    failed: preview.counts.failed,
                                    drafts: preview.counts.with_draft,
                                    skipped: preview.counts.skipped,
                                })}
                            </p>
                            {preview.items
                                .filter((item) => item.status === 'failed')
                                .slice(0, 5)
                                .map((item) => (
                                    <p
                                        key={item.item_id}
                                        className="mt-1 text-destructive"
                                    >
                                        #{item.item_id}: {item.reason}
                                    </p>
                                ))}
                        </div>
                    ) : null}
                </div>

                <AlertDialogFooter>
                    <AlertDialogCancel disabled={loading || converting}>
                        {t('common.cancel')}
                    </AlertDialogCancel>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={loading || converting}
                        onClick={() => {
                            void fetchPreview();
                        }}
                    >
                        {t('collections.convert.dryRun')}
                    </Button>
                    <Button
                        type="button"
                        disabled={!canApply || converting || loading}
                        onClick={() => {
                            void applyConvert();
                        }}
                    >
                        {t('collections.convert.confirm')}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

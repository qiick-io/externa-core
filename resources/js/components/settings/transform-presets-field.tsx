import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import type { TransformPreset } from '@/types';

type Fit = TransformPreset['fit'];
type Format = TransformPreset['format'];

type Props = {
    presets: TransformPreset[];
    fits: Fit[];
    formats: Format[];
    error?: string;
    onChange: (presets: TransformPreset[]) => void;
};

const emptyDraft = (): TransformPreset => ({
    key: '',
    fit: 'contain',
    width: 128,
    height: 128,
    quality: 82,
    without_enlargement: true,
    format: 'auto',
});

function isFit(value: string, fits: Fit[]): value is Fit {
    return fits.includes(value as Fit);
}

function isFormat(value: string, formats: Format[]): value is Format {
    return formats.includes(value as Format);
}

function summarizePreset(preset: TransformPreset): string {
    const dims = [preset.width, preset.height]
        .filter((value): value is number => value !== null)
        .join('×');

    return [dims || '—', preset.fit, preset.format, `q${preset.quality}`].join(
        ' · ',
    );
}

/**
 * List + create/edit dialog for structured image transform presets.
 */
export function TransformPresetsField({
    presets,
    fits,
    formats,
    error,
    onChange,
}: Props) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [editIndex, setEditIndex] = useState<number | null>(null);
    const [draft, setDraft] = useState<TransformPreset>(emptyDraft);
    const [localError, setLocalError] = useState<string | null>(null);

    const openCreate = (): void => {
        setEditIndex(null);
        setDraft(emptyDraft());
        setLocalError(null);
        setOpen(true);
    };

    const openEdit = (index: number): void => {
        setEditIndex(index);
        setDraft({ ...presets[index] });
        setLocalError(null);
        setOpen(true);
    };

    const removePreset = (index: number): void => {
        onChange(presets.filter((_, i) => i !== index));
    };

    const saveDraft = (): void => {
        const key = draft.key.trim().toLowerCase();

        if (!/^[a-z0-9_-]+$/.test(key)) {
            setLocalError(t('settings.project.presetKeyInvalid'));

            return;
        }

        if (draft.width === null && draft.height === null) {
            setLocalError(t('settings.project.presetDimensionsRequired'));

            return;
        }

        const duplicate = presets.some(
            (preset, index) => preset.key === key && index !== editIndex,
        );

        if (duplicate) {
            setLocalError(t('settings.project.presetKeyDuplicate'));

            return;
        }

        const next: TransformPreset = {
            ...draft,
            key,
            quality: Math.min(100, Math.max(1, draft.quality || 82)),
        };

        if (editIndex === null) {
            onChange([...presets, next]);
        } else {
            onChange(
                presets.map((preset, index) =>
                    index === editIndex ? next : preset,
                ),
            );
        }

        setOpen(false);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <Label>{t('settings.project.presetTransformations')}</Label>
                    <p className="text-sm text-muted-foreground">
                        {t('settings.project.presetTransformationsHint')}
                    </p>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openCreate}
                >
                    <Plus className="size-4" />
                    {t('settings.project.presetAdd')}
                </Button>
            </div>

            <div className="space-y-2">
                {presets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {t('settings.project.presetEmpty')}
                    </p>
                ) : (
                    presets.map((preset, index) => (
                        <div
                            key={`${preset.key}-${index}`}
                            className="flex items-center gap-3 rounded-md border px-3 py-2"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">
                                    {preset.key}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                    {summarizePreset(preset)}
                                    {preset.without_enlargement
                                        ? ` · ${t('settings.project.presetNoUpscaleShort')}`
                                        : ''}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => openEdit(index)}
                                aria-label={t('settings.project.presetEdit')}
                            >
                                <Pencil className="size-4" />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removePreset(index)}
                                disabled={presets.length <= 1}
                                aria-label={t('settings.project.presetDelete')}
                            >
                                <Trash2 className="size-4" />
                            </Button>
                        </div>
                    ))
                )}
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            {editIndex === null
                                ? t('settings.project.presetCreateTitle')
                                : t('settings.project.presetEditTitle')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('settings.project.presetDialogDescription')}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="preset-key">
                                {t('settings.project.presetKey')} *
                            </Label>
                            <Input
                                id="preset-key"
                                value={draft.key}
                                onChange={(event) =>
                                    setDraft((current) => ({
                                        ...current,
                                        key: event.target.value,
                                    }))
                                }
                                placeholder="thumbnail"
                                autoComplete="off"
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="preset-fit">
                                {t('settings.project.presetFit')}
                            </Label>
                            <Select
                                value={draft.fit}
                                onValueChange={(value) => {
                                    if (isFit(value, fits)) {
                                        setDraft((current) => ({
                                            ...current,
                                            fit: value,
                                        }));
                                    }
                                }}
                            >
                                <SelectTrigger
                                    id="preset-fit"
                                    className="w-full"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {fits.map((fit) => (
                                        <SelectItem key={fit} value={fit}>
                                            {t(
                                                `settings.project.presetFits.${fit}`,
                                                { defaultValue: fit },
                                            )}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-2">
                                <Label htmlFor="preset-width">
                                    {t('settings.project.presetWidth')}
                                </Label>
                                <Input
                                    id="preset-width"
                                    type="number"
                                    min={1}
                                    max={4096}
                                    value={draft.width ?? ''}
                                    onChange={(event) =>
                                        setDraft((current) => ({
                                            ...current,
                                            width:
                                                event.target.value === ''
                                                    ? null
                                                    : Number(
                                                          event.target.value,
                                                      ),
                                        }))
                                    }
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="preset-height">
                                    {t('settings.project.presetHeight')}
                                </Label>
                                <Input
                                    id="preset-height"
                                    type="number"
                                    min={1}
                                    max={4096}
                                    value={draft.height ?? ''}
                                    onChange={(event) =>
                                        setDraft((current) => ({
                                            ...current,
                                            height:
                                                event.target.value === ''
                                                    ? null
                                                    : Number(
                                                          event.target.value,
                                                      ),
                                        }))
                                    }
                                />
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="preset-quality">
                                    {t('settings.project.presetQuality')}
                                </Label>
                                <span className="text-sm text-muted-foreground tabular-nums">
                                    {draft.quality}
                                </span>
                            </div>
                            <Slider
                                id="preset-quality"
                                min={1}
                                max={100}
                                step={1}
                                value={[draft.quality]}
                                onValueChange={(value) =>
                                    setDraft((current) => ({
                                        ...current,
                                        quality: value[0] ?? 82,
                                    }))
                                }
                            />
                        </div>

                        <div className="flex items-center gap-3">
                            <Checkbox
                                id="preset-no-upscale"
                                checked={draft.without_enlargement}
                                onCheckedChange={(checked) =>
                                    setDraft((current) => ({
                                        ...current,
                                        without_enlargement: checked === true,
                                    }))
                                }
                            />
                            <Label htmlFor="preset-no-upscale">
                                {t('settings.project.presetNoUpscale')}
                            </Label>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="preset-format">
                                {t('settings.project.presetFormat')}
                            </Label>
                            <Select
                                value={draft.format}
                                onValueChange={(value) => {
                                    if (isFormat(value, formats)) {
                                        setDraft((current) => ({
                                            ...current,
                                            format: value,
                                        }));
                                    }
                                }}
                            >
                                <SelectTrigger
                                    id="preset-format"
                                    className="w-full"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {formats.map((format) => (
                                        <SelectItem key={format} value={format}>
                                            {t(
                                                `settings.project.presetFormats.${format}`,
                                                { defaultValue: format },
                                            )}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {localError ? (
                            <p className="text-sm text-destructive">
                                {localError}
                            </p>
                        ) : null}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                        >
                            {t('settings.project.presetCancel')}
                        </Button>
                        <Button type="button" onClick={saveDraft}>
                            {t('settings.project.presetSave')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

import { Fragment, useState, type ReactNode } from 'react';

import { FilePickerDrawer } from '@/components/admin/file-picker-drawer';
import { PaginatedMultiSelect } from '@/components/admin/paginated-multi-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { filePublicUrl } from '@/lib/files-api';
import { cn } from '@/lib/utils';
import type { AdminFileRow } from '@/types/files';

const inputLike =
    'border-input bg-background ring-offset-background focus-visible:ring-ring flex min-h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none';

type FieldDef = {
    id: number;
    name: string;
    type: string;
    translatable: boolean;
    settings?: Record<string, unknown> | null;
};

type DefaultValue = string | number | boolean | string[];

function getSelectOptions(
    settings?: Record<string, unknown> | null,
): { value: string; label: string }[] {
    const raw = settings?.options;
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .filter((o) => o && typeof o === 'object')
        .map((o) => {
            const row = o as { value?: unknown; label?: unknown };

            return {
                value: String(row.value ?? ''),
                label: String(row.label ?? row.value ?? ''),
            };
        });
}

function getDefaultScalar(
    defaults: Record<string, unknown> | undefined,
    name: string,
): DefaultValue {
    const d = defaults?.[name];
    if (
        typeof d === 'string' ||
        typeof d === 'number' ||
        typeof d === 'boolean'
    ) {
        return d;
    }
    if (Array.isArray(d) && d.every((x) => typeof x === 'string')) {
        return d;
    }

    return '';
}

function getDefaultLocale(
    defaults: Record<string, unknown> | undefined,
    name: string,
    locale: string,
): DefaultValue {
    const d = defaults?.[name];
    if (
        locale !== undefined &&
        d &&
        typeof d === 'object' &&
        !Array.isArray(d)
    ) {
        const v = (d as Record<string, unknown>)[locale];
        if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
            return v as string[];
        }
        if (
            typeof v === 'string' ||
            typeof v === 'number' ||
            typeof v === 'boolean'
        ) {
            return v;
        }
    }

    return '';
}

function TagCommaInput({
    nameBase,
    defaultParts,
}: {
    nameBase: string;
    defaultParts: string[];
}) {
    const [text, setText] = useState(() => defaultParts.join(', '));
    const parts = text
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    return (
        <>
            <textarea
                className={cn(inputLike, 'min-h-[72px] py-2')}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
            />
            {parts.map((p, i) => (
                <input key={i} type="hidden" name={`${nameBase}[]`} value={p} />
            ))}
        </>
    );
}

function FileFieldInput({
    name,
    defaultFileId,
    acceptImagesOnly = false,
}: {
    name: string;
    defaultFileId: number | null;
    acceptImagesOnly?: boolean;
}) {
    const [fileId, setFileId] = useState<number | null>(defaultFileId);
    const [preview, setPreview] = useState<AdminFileRow | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);

    return (
        <div className="space-y-2">
            <input type="hidden" name={name} value={fileId ?? ''} />
            {preview && (
                <div className="flex items-center gap-3 rounded-lg border p-3">
                    {filePublicUrl(preview) ? (
                        <img
                            src={filePublicUrl(preview)!}
                            alt={preview.name}
                            className="size-12 rounded object-cover"
                        />
                    ) : null}
                    <span className="text-sm font-medium">{preview.name}</span>
                </div>
            )}
            {!preview && fileId && (
                <p className="text-muted-foreground text-sm">File #{fileId}</p>
            )}
            <div className="flex gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                >
                    {fileId ? 'Change file' : 'Choose file'}
                </Button>
                {fileId !== null && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setFileId(null);
                            setPreview(null);
                        }}
                    >
                        Clear
                    </Button>
                )}
            </div>
            <FilePickerDrawer
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                acceptImagesOnly={acceptImagesOnly}
                title={acceptImagesOnly ? 'Choose image' : 'Choose file'}
                onSelect={(file) => {
                    setFileId(file.id);
                    setPreview(file);
                }}
            />
        </div>
    );
}

function RelationFieldInput({
    collectionId,
    field,
    name,
    defaultValue,
    multiple = false,
}: {
    collectionId: number;
    field: FieldDef;
    name: string;
    defaultValue: number | number[] | null;
    multiple?: boolean;
}) {
    const fetchUrl = `/collections/${collectionId}/items/options?field_id=${field.id}`;
    const initialIds = multiple
        ? Array.isArray(defaultValue)
            ? defaultValue
            : []
        : typeof defaultValue === 'number'
          ? [defaultValue]
          : [];

    const [selectedIds, setSelectedIds] = useState<number[]>(initialIds);

    return (
        <div className="space-y-2">
            {multiple ? (
                selectedIds.map((selectedId) => (
                    <input
                        key={selectedId}
                        type="hidden"
                        name={`${name}[]`}
                        value={selectedId}
                    />
                ))
            ) : (
                <input
                    type="hidden"
                    name={name}
                    value={selectedIds[0] ?? ''}
                />
            )}
            <PaginatedMultiSelect
                fetchUrl={fetchUrl}
                value={selectedIds}
                onChange={(next) =>
                    setSelectedIds(multiple ? next : next.slice(-1))
                }
                placeholder="Select related item…"
            />
        </div>
    );
}

function renderScalarField(
    field: FieldDef,
    defaults: Record<string, unknown> | undefined,
    name: string,
    collectionId: number,
) {
    const d = getDefaultScalar(defaults, field.name);
    const options = getSelectOptions(field.settings);

    switch (field.type) {
        case 'boolean':
            return (
                <select
                    id={name}
                    name={name}
                    className={inputLike}
                    defaultValue={
                        d === true || d === 1 || d === '1' ? '1' : '0'
                    }
                >
                    <option value="0">No</option>
                    <option value="1">Yes</option>
                </select>
            );
        case 'number':
            return (
                <Input
                    id={name}
                    type="number"
                    step="any"
                    name={name}
                    defaultValue={String(d ?? '')}
                />
            );
        case 'textarea':
        case 'markdown':
        case 'code':
            return (
                <textarea
                    id={name}
                    name={name}
                    className={cn(inputLike, 'min-h-[120px] py-2')}
                    defaultValue={String(d ?? '')}
                    rows={6}
                />
            );
        case 'select':
            return (
                <select
                    id={name}
                    name={name}
                    className={inputLike}
                    defaultValue={String(d ?? '')}
                >
                    <option value="">—</option>
                    {options.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label || o.value}
                        </option>
                    ))}
                </select>
            );
        case 'multiselect':
            return (
                <select
                    id={name}
                    name={`${name}[]`}
                    className={inputLike}
                    multiple
                    defaultValue={Array.isArray(d) ? d.map(String) : []}
                >
                    {options.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label || o.value}
                        </option>
                    ))}
                </select>
            );
        case 'radio_group':
            return (
                <div className="flex flex-col gap-2">
                    {options.map((o) => (
                        <label
                            key={o.value}
                            className="flex items-center gap-2 text-sm"
                        >
                            <input
                                type="radio"
                                name={name}
                                value={o.value}
                                defaultChecked={String(d) === o.value}
                            />
                            {o.label || o.value}
                        </label>
                    ))}
                </div>
            );
        case 'date':
            return (
                <Input
                    id={name}
                    type="date"
                    name={name}
                    defaultValue={String(d ?? '')}
                />
            );
        case 'color':
            return (
                <Input
                    id={name}
                    type="color"
                    name={name}
                    defaultValue={String(d ?? '#000000')}
                />
            );
        case 'tag':
            return (
                <TagCommaInput
                    nameBase={name}
                    defaultParts={Array.isArray(d) ? d.map(String) : []}
                />
            );
        case 'image':
            return (
                <FileFieldInput
                    name={name}
                    defaultFileId={
                        typeof d === 'number' ? d : Number(d) || null
                    }
                    acceptImagesOnly
                />
            );
        case 'file':
            return (
                <FileFieldInput
                    name={name}
                    defaultFileId={
                        typeof d === 'number' ? d : Number(d) || null
                    }
                />
            );
        case 'relation':
            return (
                <RelationFieldInput
                    collectionId={collectionId}
                    field={field}
                    name={name}
                    defaultValue={
                        typeof d === 'number' ? d : Number(d) || null
                    }
                />
            );
        case 'relation_many':
            return (
                <RelationFieldInput
                    collectionId={collectionId}
                    field={field}
                    name={name}
                    defaultValue={Array.isArray(d) ? d.map(Number) : []}
                    multiple
                />
            );
        default:
            return (
                <Input
                    id={name}
                    type="text"
                    name={name}
                    defaultValue={String(d ?? '')}
                />
            );
    }
}

function renderTranslatableField(
    field: FieldDef,
    defaults: Record<string, unknown> | undefined,
    name: (locale: string) => string,
    locale: string,
    collectionId: number,
) {
    const d = getDefaultLocale(defaults, field.name, locale);
    const options = getSelectOptions(field.settings);

    switch (field.type) {
        case 'boolean':
            return (
                <select
                    id={`${name(locale)}_${locale}`}
                    name={name(locale)}
                    className={inputLike}
                    defaultValue={
                        d === true || d === 1 || d === '1' ? '1' : '0'
                    }
                >
                    <option value="0">No</option>
                    <option value="1">Yes</option>
                </select>
            );
        case 'number':
            return (
                <Input
                    id={`${name(locale)}_${locale}`}
                    type="number"
                    step="any"
                    name={name(locale)}
                    defaultValue={String(d ?? '')}
                />
            );
        case 'textarea':
        case 'markdown':
        case 'code':
            return (
                <textarea
                    id={`${name(locale)}_${locale}`}
                    name={name(locale)}
                    className={cn(inputLike, 'min-h-[100px] py-2')}
                    defaultValue={String(d ?? '')}
                    rows={5}
                />
            );
        case 'select':
            return (
                <select
                    id={`${name(locale)}_${locale}`}
                    name={name(locale)}
                    className={inputLike}
                    defaultValue={String(d ?? '')}
                >
                    <option value="">—</option>
                    {options.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label || o.value}
                        </option>
                    ))}
                </select>
            );
        case 'multiselect':
            return (
                <select
                    id={`${name(locale)}_${locale}`}
                    name={`${name(locale)}[]`}
                    className={inputLike}
                    multiple
                    defaultValue={Array.isArray(d) ? d.map(String) : []}
                >
                    {options.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label || o.value}
                        </option>
                    ))}
                </select>
            );
        case 'radio_group':
            return (
                <div className="flex flex-col gap-2">
                    {options.map((o) => (
                        <label
                            key={o.value}
                            className="flex items-center gap-2 text-sm"
                        >
                            <input
                                type="radio"
                                name={name(locale)}
                                value={o.value}
                                defaultChecked={String(d) === o.value}
                            />
                            {o.label || o.value}
                        </label>
                    ))}
                </div>
            );
        case 'date':
            return (
                <Input
                    id={`${name(locale)}_${locale}`}
                    type="date"
                    name={name(locale)}
                    defaultValue={String(d ?? '')}
                />
            );
        case 'color':
            return (
                <Input
                    id={`${name(locale)}_${locale}`}
                    type="color"
                    name={name(locale)}
                    defaultValue={String(d ?? '#000000')}
                />
            );
        case 'tag':
            return (
                <TagCommaInput
                    nameBase={name(locale)}
                    defaultParts={Array.isArray(d) ? d.map(String) : []}
                />
            );
        default:
            return (
                <Input
                    id={`${name(locale)}_${locale}`}
                    type="text"
                    name={name(locale)}
                    defaultValue={String(d ?? '')}
                />
            );
    }
}

export function DynamicItemFields({
    fields,
    locales,
    defaults,
    collectionId,
    variant = 'plain',
    fieldActions,
}: {
    fields: FieldDef[];
    locales: string[];
    defaults?: Record<string, unknown>;
    collectionId: number;
    variant?: 'plain' | 'cards';
    fieldActions?: (field: FieldDef) => ReactNode;
}) {
    const showFieldNameHeading = variant === 'plain';
    const gapClass = variant === 'cards' ? 'space-y-4' : 'space-y-6';

    return (
        <div className={gapClass}>
            {fields.map((field) => {
                const inner = field.translatable ? (
                    <div className="space-y-3">
                        {showFieldNameHeading && (
                            <p className="text-sm font-medium">{field.name}</p>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                            {locales.map((locale) => (
                                <div key={locale} className="grid gap-2">
                                    <Label
                                        htmlFor={`data_${field.name}_${locale}`}
                                    >
                                        {field.name} ({locale})
                                    </Label>
                                    {renderTranslatableField(
                                        field,
                                        defaults,
                                        (loc) => `data[${field.name}][${loc}]`,
                                        locale,
                                        collectionId,
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="grid gap-2">
                        {showFieldNameHeading && (
                            <Label htmlFor={`data_${field.name}`}>
                                {field.name}
                            </Label>
                        )}
                        {renderScalarField(
                            field,
                            defaults,
                            `data[${field.name}]`,
                            collectionId,
                        )}
                    </div>
                );

                if (variant === 'cards') {
                    return (
                        <div
                            key={field.id}
                            className="rounded-xl border border-sidebar-border/70 bg-card p-4 dark:border-sidebar-border"
                        >
                            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-sidebar-border/70 pb-3 dark:border-sidebar-border">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-sm font-medium">
                                        {field.name}
                                    </span>
                                    <Badge variant="outline">
                                        {field.type}
                                    </Badge>
                                    {field.translatable && (
                                        <Badge variant="secondary">
                                            Translatable
                                        </Badge>
                                    )}
                                </div>
                                {fieldActions?.(field)}
                            </div>
                            {inner}
                        </div>
                    );
                }

                return <Fragment key={field.id}>{inner}</Fragment>;
            })}
        </div>
    );
}

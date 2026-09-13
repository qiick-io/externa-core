import { Fragment, useEffect, useMemo, useState } from 'react';

import { PaginatedMultiSelect } from '@/components/admin/paginated-multi-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseRelationFieldSettings } from '@/lib/collection-field-types';

type FieldDef = {
    id: number;
    name: string;
    type: string;
    translatable: boolean;
    settings?: Record<string, unknown> | null;
};

type DefaultValue =
    | string
    | number
    | boolean
    | string[]
    | number[]
    | Array<Record<string, unknown>>
    | Record<string, unknown>
    | null;

type M2mLink = {
    related_item_id: number;
    meta: Record<string, string>;
};

function parseM2mLinks(value: DefaultValue): M2mLink[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const links: M2mLink[] = [];

    for (const entry of value) {
        if (typeof entry === 'number' && Number.isFinite(entry)) {
            links.push({ related_item_id: entry, meta: {} });
            continue;
        }

        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            continue;
        }

        const row = entry as Record<string, unknown>;
        const id = Number(row.related_item_id ?? row.id);

        if (!Number.isFinite(id) || id <= 0) {
            continue;
        }

        const rawMeta =
            row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)
                ? (row.meta as Record<string, unknown>)
                : {};
        const meta: Record<string, string> = {};

        for (const [key, metaValue] of Object.entries(rawMeta)) {
            meta[key] =
                metaValue === null || metaValue === undefined
                    ? ''
                    : String(metaValue);
        }

        links.push({ related_item_id: id, meta });
    }

    return links;
}

/**
 * M2M picker that stores `{ related_item_id, meta }` and keeps junction meta on save.
 */
function relationOptionsQuery(field: FieldDef): string {
    const params = new URLSearchParams({
        field_id: String(field.id),
    });
    // Nested relation fields reuse the parent blocks field id; pass related_collection_id so options resolve.
    const relatedId = Number(
        (
            field.settings as
                { related_collection_id?: unknown } | null | undefined
        )?.related_collection_id,
    );

    if (Number.isFinite(relatedId) && relatedId > 0) {
        params.set('related_collection_id', String(relatedId));
    }

    const displayField = String(
        (field.settings as { display_field?: unknown } | null | undefined)
            ?.display_field ?? '',
    ).trim();

    if (displayField !== '') {
        params.set('display_field', displayField);
    }

    return params.toString();
}

export function ManyToManyFieldInput({
    collectionId,
    field,
    name,
    defaultValue,
    readonly = false,
}: {
    collectionId: number;
    field: FieldDef;
    name: string;
    defaultValue: DefaultValue;
    readonly?: boolean;
}) {
    const relationSettings = parseRelationFieldSettings(field.settings);
    const junctionFields = relationSettings.junctionFields;
    const optionsQuery = relationOptionsQuery(field);
    const fetchUrl = `/collections/${collectionId}/items/options?${optionsQuery}`;
    const [links, setLinks] = useState<M2mLink[]>(() =>
        parseM2mLinks(defaultValue),
    );
    const selectedIds = links.map((link) => link.related_item_id);
    const [initialOptions, setInitialOptions] = useState<
        { id: number; label: string }[]
    >([]);

    useEffect(() => {
        if (selectedIds.length === 0) {
            return;
        }

        const params = new URLSearchParams(optionsQuery);
        params.set('per_page', '100');

        void fetch(`/collections/${collectionId}/items/options?${params}`, {
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'same-origin',
        })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload) => {
                if (!payload || !Array.isArray(payload.data)) {
                    return;
                }

                const options = payload.data
                    .filter((row: { id: number }) =>
                        selectedIds.includes(row.id),
                    )
                    .map((row: { id: number; label?: string }) => ({
                        id: row.id,
                        label: row.label ?? `#${row.id}`,
                    }));

                setInitialOptions(options);
            })
            .catch(() => undefined);
        // ponytail: only refetch labels when ids change, not on meta edits
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collectionId, optionsQuery, selectedIds.join(',')]);

    const onChangeIds = (nextIds: number[]): void => {
        setLinks((current) => {
            const byId = new Map(
                current.map((link) => [link.related_item_id, link]),
            );

            return nextIds.map((id) => {
                const existing = byId.get(id);

                return existing ?? { related_item_id: id, meta: {} };
            });
        });
    };

    const updateMeta = (itemId: number, key: string, value: string): void => {
        setLinks((current) =>
            current.map((link) =>
                link.related_item_id === itemId
                    ? { ...link, meta: { ...link.meta, [key]: value } }
                    : link,
            ),
        );
    };

    return (
        <div className="space-y-3">
            {links.map((link, index) => (
                <Fragment key={link.related_item_id}>
                    <input
                        type="hidden"
                        name={`${name}[${index}][related_item_id]`}
                        value={link.related_item_id}
                    />
                    {junctionFields.map((junctionField) => (
                        <input
                            key={`${link.related_item_id}-${junctionField.name}`}
                            type="hidden"
                            name={`${name}[${index}][meta][${junctionField.name}]`}
                            value={link.meta[junctionField.name] ?? ''}
                        />
                    ))}
                    {junctionFields.length === 0
                        ? Object.entries(link.meta).map(([key, value]) => (
                              <input
                                  key={`${link.related_item_id}-meta-${key}`}
                                  type="hidden"
                                  name={`${name}[${index}][meta][${key}]`}
                                  value={value}
                              />
                          ))
                        : null}
                </Fragment>
            ))}
            <PaginatedMultiSelect
                fetchUrl={fetchUrl}
                value={selectedIds}
                disabled={readonly}
                multiple
                initialOptions={initialOptions}
                onChange={onChangeIds}
                placeholder={
                    relationSettings.displayField
                        ? `Select by ${relationSettings.displayField}…`
                        : 'Select related item…'
                }
            />
            {junctionFields.length > 0 && links.length > 0 ? (
                <div className="space-y-2 rounded-lg border p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                        Junction metadata
                    </p>
                    {links.map((link) => {
                        const label =
                            initialOptions.find(
                                (option) => option.id === link.related_item_id,
                            )?.label ?? `#${link.related_item_id}`;

                        return (
                            <div
                                key={`meta-${link.related_item_id}`}
                                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_repeat(auto-fit,minmax(8rem,1fr))]"
                            >
                                <div className="truncate text-sm font-medium">
                                    {label}
                                </div>
                                {junctionFields.map((junctionField) => (
                                    <div
                                        key={junctionField.name}
                                        className="grid gap-1"
                                    >
                                        <Label className="text-xs">
                                            {junctionField.name}
                                        </Label>
                                        <Input
                                            type={
                                                junctionField.type === 'number'
                                                    ? 'number'
                                                    : 'text'
                                            }
                                            value={
                                                link.meta[junctionField.name] ??
                                                ''
                                            }
                                            disabled={readonly}
                                            onChange={(event) =>
                                                updateMeta(
                                                    link.related_item_id,
                                                    junctionField.name,
                                                    event.target.value,
                                                )
                                            }
                                        />
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

export function RelationFieldInput({
    collectionId,
    field,
    name,
    defaultValue,
    multiple = false,
    readonly = false,
}: {
    collectionId: number;
    field: FieldDef;
    name: string;
    defaultValue: number | number[] | null;
    multiple?: boolean;
    readonly?: boolean;
}) {
    const relationSettings = parseRelationFieldSettings(field.settings);
    const optionsQuery = relationOptionsQuery(field);
    const fetchUrl = `/collections/${collectionId}/items/options?${optionsQuery}`;
    const initialIds = useMemo(
        () =>
            multiple
                ? Array.isArray(defaultValue)
                    ? defaultValue
                    : []
                : typeof defaultValue === 'number'
                  ? [defaultValue]
                  : [],
        [multiple, defaultValue],
    );

    const [selectedIds, setSelectedIds] = useState<number[]>(initialIds);
    const [initialOptions, setInitialOptions] = useState<
        { id: number; label: string }[]
    >([]);

    useEffect(() => {
        if (initialIds.length === 0) {
            return;
        }

        const params = new URLSearchParams(optionsQuery);
        params.set('per_page', '100');

        void fetch(`/collections/${collectionId}/items/options?${params}`, {
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'same-origin',
        })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload) => {
                if (!payload || !Array.isArray(payload.data)) {
                    return;
                }

                const options = payload.data
                    .filter((row: { id: number }) =>
                        initialIds.includes(row.id),
                    )
                    .map((row: { id: number; label?: string }) => ({
                        id: row.id,
                        label: row.label ?? `#${row.id}`,
                    }));

                setInitialOptions(options);
            })
            .catch(() => undefined);
    }, [collectionId, optionsQuery, initialIds]);

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
                <input type="hidden" name={name} value={selectedIds[0] ?? ''} />
            )}
            <PaginatedMultiSelect
                fetchUrl={fetchUrl}
                value={selectedIds}
                disabled={readonly}
                multiple={multiple}
                initialOptions={initialOptions}
                onChange={(next) => setSelectedIds(next)}
                placeholder={
                    relationSettings.displayField
                        ? `Select by ${relationSettings.displayField}…`
                        : 'Select related item…'
                }
            />
        </div>
    );
}

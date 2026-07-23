import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { getFieldDisplayName } from '@/lib/collection-field-types';
import { cn } from '@/lib/utils';
import type { CollectionFieldRow } from '@/types';

type ItemTableCellProps = {
    path: string;
    row: {
        id: number;
        data: Record<string, unknown>;
        created_at?: string | null;
        updated_at?: string | null;
        displays?: Record<string, string | null>;
        thumbs?: Record<string, string | null>;
    };
    fieldsByName: Record<string, CollectionFieldRow>;
};

function formatDate(value: unknown): string | null {
    if (typeof value !== 'string' || value === '') {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

function empty(): string {
    return '—';
}

/**
 * Typed cell renderer for collection item list columns.
 */
export function ItemTableCell({
    path,
    row,
    fieldsByName,
}: ItemTableCellProps) {
    if (path === 'id') {
        return <span className="tabular-nums">{row.id}</span>;
    }

    if (path === 'created_at') {
        return (
            <span className="text-muted-foreground text-sm">
                {formatDate(row.created_at) ?? empty()}
            </span>
        );
    }

    if (path === 'updated_at') {
        return (
            <span className="text-muted-foreground text-sm">
                {formatDate(row.updated_at) ?? empty()}
            </span>
        );
    }

    const parent = path.includes('.') ? path.split('.')[0]! : path;
    const field = fieldsByName[parent];
    const display = row.displays?.[path];
    const thumb = row.thumbs?.[path];

    if (field && isRelationOrFile(field.type)) {
        if (thumb) {
            return (
                <span className="inline-flex items-center gap-2">
                    <img
                        src={thumb}
                        alt=""
                        className="size-7 rounded object-cover"
                    />
                    <span className="max-w-[12rem] truncate text-sm">
                        {display ?? empty()}
                    </span>
                </span>
            );
        }

        return (
            <span className="max-w-[16rem] truncate text-sm">
                {display ?? empty()}
            </span>
        );
    }

    if (path.includes('.')) {
        return (
            <span className="max-w-[16rem] truncate text-sm">
                {display ?? empty()}
            </span>
        );
    }

    const value = row.data[path];
    const type = field?.type ?? 'string';

    return renderTypedValue(type, value);
}

function isRelationOrFile(type: string): boolean {
    return [
        'relation',
        'many_to_one',
        'one_to_many',
        'many_to_many',
        'relation_tree',
        'relation_many',
        'image',
        'file',
        'files',
    ].includes(type);
}

function renderTypedValue(type: string, value: unknown): ReactNode {
    if (value === null || value === undefined || value === '') {
        return (
            <span className="text-muted-foreground">{empty()}</span>
        );
    }

    switch (type) {
        case 'boolean':
            return value === true || value === 1 || value === '1' ? (
                <Check className="text-foreground size-4" aria-label="Yes" />
            ) : (
                <X className="text-muted-foreground size-4" aria-label="No" />
            );
        case 'date':
            return (
                <span className="text-sm">{formatDate(value) ?? empty()}</span>
            );
        case 'tag':
        case 'multiselect':
        case 'checkbox_group':
        case 'checkbox_group_tree': {
            const tags = Array.isArray(value)
                ? value.map(String)
                : [String(value)];
            const text = tags.join(', ');

            return (
                <span className="max-w-[14rem] truncate text-sm" title={text}>
                    {text || empty()}
                </span>
            );
        }
        case 'map': {
            if (
                typeof value === 'object' &&
                value !== null &&
                'lat' in value &&
                'lng' in value
            ) {
                const lat = (value as { lat: unknown }).lat;
                const lng = (value as { lng: unknown }).lng;

                return (
                    <span className="font-mono text-xs">
                        {String(lat)},{String(lng)}
                    </span>
                );
            }

            return (
                <span className="text-muted-foreground">{empty()}</span>
            );
        }
        case 'hash':
            return (
                <span
                    className="max-w-[10rem] truncate font-mono text-xs"
                    title={String(value)}
                >
                    {String(value)}
                </span>
            );
        case 'color':
            return (
                <span className="inline-flex items-center gap-2 text-sm">
                    <span
                        className={cn('size-3.5 rounded-sm border')}
                        style={{
                            backgroundColor: String(value),
                        }}
                    />
                    {String(value)}
                </span>
            );
        default:
            return (
                <span className="max-w-[16rem] truncate text-sm">
                    {typeof value === 'object'
                        ? JSON.stringify(value)
                        : String(value)}
                </span>
            );
    }
}

/**
 * Resolve a human header label for a column path.
 */
export function columnHeaderLabel(
    path: string,
    fieldsByName: Record<string, CollectionFieldRow>,
    relatedFieldsCatalog: Record<
        string,
        { name: string; display_name: string; type: string }[]
    >,
): string {
    if (path === 'id') {
        return 'ID';
    }
    if (path === 'created_at') {
        return 'Created at';
    }
    if (path === 'updated_at') {
        return 'Updated at';
    }

    if (!path.includes('.')) {
        const field = fieldsByName[path];

        return field
            ? getFieldDisplayName(field.settings, field.name)
            : path;
    }

    const [parent, child] = path.split('.', 2);
    const field = fieldsByName[parent ?? ''];
    const parentLabel = field
        ? getFieldDisplayName(field.settings, field.name)
        : (parent ?? path);
    const childEntry = (relatedFieldsCatalog[parent ?? ''] ?? []).find(
        (entry) => entry.name === child,
    );

    return `${parentLabel}.${childEntry?.display_name ?? child}`;
}

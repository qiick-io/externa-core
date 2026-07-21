import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContentLocaleFlag } from '@/components/collections/content-locale-flag';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    contentLocaleMeta,
    type ContentLocaleCatalogEntry,
} from '@/lib/content-locales-catalog';
import { cn } from '@/lib/utils';

type Props = {
    catalog: ContentLocaleCatalogEntry[];
    value: string[];
    defaultLocale: string;
    onChange: (locales: string[], defaultLocale: string) => void;
};

function SortableLocaleRow({
    code,
    onRemove,
    canRemove,
}: {
    code: string;
    onRemove: () => void;
    canRemove: boolean;
}) {
    const meta = contentLocaleMeta(code);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: code });

    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
            }}
            className={cn(
                'flex items-center gap-2 rounded-md border px-3 py-2',
                isDragging && 'bg-muted opacity-80',
            )}
        >
            <button
                type="button"
                className="text-muted-foreground hover:text-foreground cursor-grab touch-none"
                aria-label="Reorder"
                {...attributes}
                {...listeners}
            >
                <GripVertical className="size-4" />
            </button>
            <ContentLocaleFlag region={meta.flag} title={meta.name} />
            <span className="flex-1 text-sm">
                <span className="font-medium">{meta.name}</span>
                <span className="text-muted-foreground ml-2 font-mono text-xs">
                    {code}
                </span>
            </span>
            <button
                type="button"
                className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                onClick={onRemove}
                disabled={!canRemove}
                aria-label={`Remove ${code}`}
            >
                <X className="size-4" />
            </button>
        </div>
    );
}

/**
 * Searchable multi-select + sortable list for project content locales.
 */
export function ContentLocalesField({
    catalog,
    value,
    defaultLocale,
    onChange,
}: Props) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const selected = new Set(value);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (q === '') {
            return catalog;
        }

        return catalog.filter(
            (entry) =>
                entry.code.toLowerCase().includes(q) ||
                entry.name.toLowerCase().includes(q),
        );
    }, [catalog, query]);

    const setLocales = (next: string[]): void => {
        let nextDefault = defaultLocale;
        if (!next.includes(nextDefault)) {
            nextDefault = next[0] ?? '';
        }
        onChange(next, nextDefault);
    };

    const toggle = (code: string, enabled: boolean): void => {
        if (enabled) {
            if (selected.has(code)) {
                return;
            }
            setLocales([...value, code]);

            return;
        }

        if (value.length <= 1) {
            return;
        }

        setLocales(value.filter((entry) => entry !== code));
    };

    const onDragEnd = (event: DragEndEvent): void => {
        const { active, over } = event;
        if (!over || active.id === over.id) {
            return;
        }

        const oldIndex = value.indexOf(String(active.id));
        const newIndex = value.indexOf(String(over.id));
        if (oldIndex < 0 || newIndex < 0) {
            return;
        }

        setLocales(arrayMove(value, oldIndex, newIndex));
    };

    return (
        <div className="space-y-4">
            <div className="grid gap-2">
                <Label htmlFor="content_locales_search">
                    {t('settings.project.contentLocalesAdd')}
                </Label>
                <div className="relative">
                    <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
                    <Input
                        id="content_locales_search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t(
                            'settings.project.contentLocalesSearch',
                        )}
                        className="pl-9"
                    />
                </div>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                    {filtered.map((entry) => {
                        const checked = selected.has(entry.code);

                        return (
                            <label
                                key={entry.code}
                                className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5"
                            >
                                <Checkbox
                                    checked={checked}
                                    disabled={checked && value.length <= 1}
                                    onCheckedChange={(state) =>
                                        toggle(entry.code, state === true)
                                    }
                                />
                                <ContentLocaleFlag
                                    region={entry.flag}
                                    title={entry.name}
                                />
                                <span className="flex-1 text-sm">
                                    {entry.name}
                                </span>
                                <span className="text-muted-foreground font-mono text-xs">
                                    {entry.code}
                                </span>
                            </label>
                        );
                    })}
                    {filtered.length === 0 ? (
                        <p className="text-muted-foreground px-2 py-3 text-sm">
                            {t('settings.project.contentLocalesEmpty')}
                        </p>
                    ) : null}
                </div>
            </div>

            <div className="grid gap-2">
                <Label>{t('settings.project.contentLocalesSelected')}</Label>
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={onDragEnd}
                >
                    <SortableContext
                        items={value}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="space-y-2">
                            {value.map((code) => (
                                <SortableLocaleRow
                                    key={code}
                                    code={code}
                                    canRemove={value.length > 1}
                                    onRemove={() => toggle(code, false)}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>

            <div className="grid gap-2">
                <Label htmlFor="default_content_locale">
                    {t('settings.project.defaultContentLocale')}
                </Label>
                <Select
                    value={defaultLocale}
                    onValueChange={(next) => onChange(value, next)}
                >
                    <SelectTrigger
                        id="default_content_locale"
                        className="w-full"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {value.map((code) => {
                            const meta = contentLocaleMeta(code);

                            return (
                                <SelectItem key={code} value={code}>
                                    <span className="inline-flex items-center gap-2">
                                        <ContentLocaleFlag
                                            region={meta.flag}
                                        />
                                        {meta.name} ({code})
                                    </span>
                                </SelectItem>
                            );
                        })}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

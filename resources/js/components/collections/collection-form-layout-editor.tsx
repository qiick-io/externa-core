import { router } from '@inertiajs/react';
import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    newFormLayoutId,
    parseCollectionFormLayout,
    resolveFormLayoutLabel,
} from '@/lib/collection-form-layout';
import type {
    CollectionFormLayout,
    FormLayoutSection,
    FormLayoutTab,
} from '@/lib/collection-form-layout';
import type { CollectionFieldRow } from '@/types';

type CollectionFormLayoutEditorProps = {
    collectionId: number;
    fields: CollectionFieldRow[];
    formLayout?: Record<string, unknown> | null;
    locales?: string[];
};

/**
 * Lightweight editor for collection form_layout (tabs + collapsible sections).
 * Fields stay leaves; this is presentation metadata only.
 */
export function CollectionFormLayoutEditor({
    collectionId,
    fields,
    formLayout,
    locales = ['en'],
}: CollectionFormLayoutEditorProps) {
    const initial = useMemo(
        () =>
            parseCollectionFormLayout(formLayout) ?? {
                version: 1,
                tabs: [],
                sections: [],
            },
        [formLayout],
    );

    const [tabs, setTabs] = useState<FormLayoutTab[]>(initial.tabs);
    const [sections, setSections] = useState<FormLayoutSection[]>(
        initial.sections,
    );
    const [saving, setSaving] = useState(false);

    const placedIds = useMemo(() => {
        const ids = new Set<number>();

        for (const section of sections) {
            for (const fieldId of section.field_ids) {
                ids.add(fieldId);
            }
        }

        return ids;
    }, [sections]);

    const unplacedFields = fields.filter((field) => !placedIds.has(field.id));

    const persist = (
        nextTabs: FormLayoutTab[],
        nextSections: FormLayoutSection[],
    ): void => {
        const payload: CollectionFormLayout = {
            version: 1,
            tabs: nextTabs,
            sections: nextSections,
        };

        setSaving(true);
        router.put(
            FieldController.updateFormLayout.url(collectionId),
            {
                form_layout:
                    nextTabs.length === 0 && nextSections.length === 0
                        ? null
                        : payload,
            },
            {
                preserveScroll: true,
                onFinish: () => setSaving(false),
            },
        );
    };

    const addTab = (): void => {
        const nextTabs = [
            ...tabs,
            {
                id: newFormLayoutId('tab'),
                label: { en: `Tab ${tabs.length + 1}` },
            },
        ];
        setTabs(nextTabs);
        persist(nextTabs, sections);
    };

    const addSection = (): void => {
        const nextSections = [
            ...sections,
            {
                id: newFormLayoutId('section'),
                tab_id: tabs[0]?.id ?? null,
                label: { en: `Section ${sections.length + 1}` },
                collapsible: true,
                collapsed: false,
                field_ids: [],
            },
        ];
        setSections(nextSections);
        persist(tabs, nextSections);
    };

    const updateSection = (
        sectionId: string,
        updater: (section: FormLayoutSection) => FormLayoutSection,
    ): void => {
        const nextSections = sections.map((section) =>
            section.id === sectionId ? updater(section) : section,
        );
        setSections(nextSections);
        persist(tabs, nextSections);
    };

    const removeSection = (sectionId: string): void => {
        const nextSections = sections.filter(
            (section) => section.id !== sectionId,
        );
        setSections(nextSections);
        persist(tabs, nextSections);
    };

    const clearLayout = (): void => {
        setTabs([]);
        setSections([]);
        persist([], []);
    };

    return (
        <div className="space-y-4 rounded-xl border border-sidebar-border/70 p-4 dark:border-sidebar-border">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-medium">Form layout</h3>
                    <p className="text-sm text-muted-foreground">
                        Optional tabs and collapsible sections. Field order and
                        half/full width still come from the field list below.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={addTab}
                        disabled={saving}
                    >
                        Add tab
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={addSection}
                        disabled={saving}
                    >
                        Add section
                    </Button>
                    {(tabs.length > 0 || sections.length > 0) && (
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={clearLayout}
                            disabled={saving}
                        >
                            Clear layout
                        </Button>
                    )}
                </div>
            </div>

            {tabs.length > 0 && (
                <div className="space-y-2">
                    <Label>Tabs</Label>
                    <div className="flex flex-col gap-2">
                        {tabs.map((tab, index) => (
                            <div
                                key={tab.id}
                                className="flex items-center gap-2"
                            >
                                <Input
                                    value={resolveFormLayoutLabel(
                                        tab.label,
                                        locales,
                                        tab.id,
                                    )}
                                    onChange={(event) => {
                                        const nextTabs = tabs.map(
                                            (entry, entryIndex) =>
                                                entryIndex === index
                                                    ? {
                                                          ...entry,
                                                          label: {
                                                              en: event.target
                                                                  .value,
                                                          },
                                                      }
                                                    : entry,
                                        );
                                        setTabs(nextTabs);
                                    }}
                                    onBlur={() => persist(tabs, sections)}
                                />
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => {
                                        const nextTabs = tabs.filter(
                                            (entry) => entry.id !== tab.id,
                                        );
                                        const nextSections = sections.map(
                                            (section) =>
                                                section.tab_id === tab.id
                                                    ? {
                                                          ...section,
                                                          tab_id: null,
                                                      }
                                                    : section,
                                        );
                                        setTabs(nextTabs);
                                        setSections(nextSections);
                                        persist(nextTabs, nextSections);
                                    }}
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {sections.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No sections yet — item forms render fields in schema order
                    with width settings only.
                </p>
            ) : (
                <div className="space-y-3">
                    {sections.map((section) => (
                        <div
                            key={section.id}
                            className="space-y-3 rounded-lg border border-dashed border-sidebar-border/80 p-3"
                        >
                            <div className="flex flex-wrap items-end gap-2">
                                <div className="grid min-w-[12rem] flex-1 gap-1">
                                    <Label>Section label</Label>
                                    <Input
                                        value={resolveFormLayoutLabel(
                                            section.label,
                                            locales,
                                            section.id,
                                        )}
                                        onChange={(event) => {
                                            setSections((current) =>
                                                current.map((entry) =>
                                                    entry.id === section.id
                                                        ? {
                                                              ...entry,
                                                              label: {
                                                                  en: event
                                                                      .target
                                                                      .value,
                                                              },
                                                          }
                                                        : entry,
                                                ),
                                            );
                                        }}
                                        onBlur={() => persist(tabs, sections)}
                                    />
                                </div>
                                {tabs.length > 0 && (
                                    <div className="grid gap-1">
                                        <Label>Tab</Label>
                                        <select
                                            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                            value={section.tab_id ?? ''}
                                            onChange={(event) =>
                                                updateSection(
                                                    section.id,
                                                    (current) => ({
                                                        ...current,
                                                        tab_id:
                                                            event.target
                                                                .value || null,
                                                    }),
                                                )
                                            }
                                        >
                                            <option value="">No tab</option>
                                            {tabs.map((tab) => (
                                                <option
                                                    key={tab.id}
                                                    value={tab.id}
                                                >
                                                    {resolveFormLayoutLabel(
                                                        tab.label,
                                                        locales,
                                                        tab.id,
                                                    )}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => removeSection(section.id)}
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>

                            <div className="space-y-2">
                                <Label>Fields in section</Label>
                                <div className="flex flex-wrap gap-2">
                                    {section.field_ids.map((fieldId) => {
                                        const field = fields.find(
                                            (entry) => entry.id === fieldId,
                                        );

                                        return (
                                            <button
                                                key={fieldId}
                                                type="button"
                                                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
                                                onClick={() =>
                                                    updateSection(
                                                        section.id,
                                                        (current) => ({
                                                            ...current,
                                                            field_ids:
                                                                current.field_ids.filter(
                                                                    (id) =>
                                                                        id !==
                                                                        fieldId,
                                                                ),
                                                        }),
                                                    )
                                                }
                                            >
                                                {field?.name ?? fieldId}
                                                <Trash2 className="size-3" />
                                            </button>
                                        );
                                    })}
                                </div>
                                {unplacedFields.length > 0 && (
                                    <select
                                        className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm"
                                        defaultValue=""
                                        onChange={(event) => {
                                            const fieldId = Number(
                                                event.target.value,
                                            );
                                            event.target.value = '';

                                            if (!Number.isFinite(fieldId)) {
                                                return;
                                            }

                                            updateSection(
                                                section.id,
                                                (current) => ({
                                                    ...current,
                                                    field_ids: [
                                                        ...current.field_ids,
                                                        fieldId,
                                                    ],
                                                }),
                                            );
                                        }}
                                    >
                                        <option value="" disabled>
                                            Add field…
                                        </option>
                                        {unplacedFields.map((field) => (
                                            <option
                                                key={field.id}
                                                value={field.id}
                                            >
                                                {field.name} ({field.type})
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {unplacedFields.length > 0 && sections.length > 0 && (
                <p className="text-xs text-muted-foreground">
                    Unplaced fields (
                    {unplacedFields.map((field) => field.name).join(', ')})
                    render in an “Other” group on the item form.
                </p>
            )}

            {saving ? (
                <p className="text-xs text-muted-foreground">Saving layout…</p>
            ) : null}
        </div>
    );
}

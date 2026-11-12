import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { parseAllowedCollectionIds } from '@/lib/collection-field-types';
import type { RelatedCollectionOption } from '@/lib/collection-field-types';
import { scalarToString } from '@/lib/scalar-to-string';

/** Relation settings of a many-to-many / one-to-many field nested in a block type. */
export function NestedRelationSettings({
    settings,
    relatedCollections,
    showJunctionFields,
    onChange,
}: {
    settings: Record<string, unknown>;
    relatedCollections: RelatedCollectionOption[];
    showJunctionFields?: boolean;
    onChange: (next: Record<string, unknown>) => void;
}) {
    const { t } = useTranslation();
    const relatedCollectionId = scalarToString(
        settings.related_collection_id,
        '',
    );
    const displayField = scalarToString(settings.display_field, 'title');
    const junctionJson = Array.isArray(settings.junction_fields)
        ? JSON.stringify(settings.junction_fields, null, 2)
        : typeof settings.junction_fields === 'string'
          ? settings.junction_fields
          : '';

    return (
        <div className="space-y-3 rounded-md bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
                {t('collections.fieldSettings.form.nestedRelationHint')}
            </p>
            <Field>
                <FieldLabel>
                    {t(
                        'collections.fieldSettings.relational.relatedCollection',
                    )}
                </FieldLabel>
                <NativeSelect
                    value={relatedCollectionId}
                    onChange={(event) =>
                        onChange({
                            ...settings,
                            related_collection_id: event.target.value
                                ? Number(event.target.value)
                                : null,
                        })
                    }
                    className="w-full"
                >
                    <option value="">
                        {t(
                            'collections.fieldSettings.relational.selectCollection',
                        )}
                    </option>
                    {relatedCollections.map((relatedCollection) => (
                        <option
                            key={relatedCollection.id}
                            value={String(relatedCollection.id)}
                        >
                            {relatedCollection.name}
                        </option>
                    ))}
                </NativeSelect>
            </Field>
            <Field>
                <FieldLabel>
                    {t('collections.fieldSettings.relational.displayField')}
                </FieldLabel>
                <Input
                    value={displayField}
                    onChange={(event) =>
                        onChange({
                            ...settings,
                            display_field: event.target.value,
                        })
                    }
                    placeholder="title"
                />
            </Field>
            {showJunctionFields ? (
                <Field>
                    <FieldLabel>
                        {t('collections.fieldSettings.form.junctionMetaFields')}
                    </FieldLabel>
                    <Textarea
                        value={junctionJson}
                        onChange={(event) => {
                            const raw = event.target.value;

                            try {
                                const parsed = JSON.parse(raw) as unknown;
                                onChange({
                                    ...settings,
                                    junction_fields: Array.isArray(parsed)
                                        ? parsed
                                        : raw,
                                });
                            } catch {
                                onChange({
                                    ...settings,
                                    junction_fields: raw,
                                });
                            }
                        }}
                        className="min-h-18 font-mono text-xs md:text-xs"
                        placeholder='[{"name":"caption","type":"string"}]'
                    />
                </Field>
            ) : null}
        </div>
    );
}

/** Allowed collections of an m2a field nested in a block type. */
export function NestedM2aSettings({
    settings,
    relatedCollections,
    onChange,
}: {
    settings: Record<string, unknown>;
    relatedCollections: RelatedCollectionOption[];
    onChange: (next: Record<string, unknown>) => void;
}) {
    const { t } = useTranslation();
    const idPrefix = useId();
    const allowedIds = parseAllowedCollectionIds(settings);
    const allowDuplicates =
        settings.allow_duplicates === true ||
        settings.allow_duplicates === 1 ||
        settings.allow_duplicates === '1';

    return (
        <div className="space-y-3 rounded-md bg-muted/30 p-3">
            <FieldSet className="gap-3">
                <FieldLegend variant="label" className="mb-0">
                    {t(
                        'collections.fieldSettings.relational.allowedCollections',
                    )}
                </FieldLegend>
                <div className="space-y-2">
                    {relatedCollections.map((relatedCollection) => {
                        const checked = allowedIds.includes(
                            relatedCollection.id,
                        );
                        const checkboxId = `${idPrefix}_allowed_collection_${relatedCollection.id}`;

                        return (
                            <Field
                                key={relatedCollection.id}
                                orientation="horizontal"
                            >
                                <Checkbox
                                    id={checkboxId}
                                    checked={checked}
                                    onCheckedChange={(isChecked) => {
                                        const nextIds =
                                            isChecked === true
                                                ? [
                                                      ...allowedIds,
                                                      relatedCollection.id,
                                                  ]
                                                : allowedIds.filter(
                                                      (id) =>
                                                          id !==
                                                          relatedCollection.id,
                                                  );
                                        onChange({
                                            ...settings,
                                            allowed_collection_ids: nextIds,
                                        });
                                    }}
                                />
                                <FieldLabel
                                    htmlFor={checkboxId}
                                    className="font-normal"
                                >
                                    {relatedCollection.name}
                                </FieldLabel>
                            </Field>
                        );
                    })}
                </div>
            </FieldSet>
            <Field orientation="horizontal">
                <Checkbox
                    id={`${idPrefix}_allow_duplicates`}
                    checked={allowDuplicates}
                    onCheckedChange={(isChecked) =>
                        onChange({
                            ...settings,
                            allow_duplicates: isChecked === true ? '1' : '0',
                        })
                    }
                />
                <FieldLabel
                    htmlFor={`${idPrefix}_allow_duplicates`}
                    className="font-normal"
                >
                    {t(
                        'collections.fieldSettings.relational.allowDuplicateLinks',
                    )}
                </FieldLabel>
            </Field>
        </div>
    );
}

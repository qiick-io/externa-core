import { Form } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import { FieldConfigPanel } from '@/components/collections/field-settings/field-config-panel';
import { FieldTypeHeader } from '@/components/collections/field-settings/field-type-picker';
import {
    parseAccordionGroupSettings,
    parseDetailGroupSettings,
    parseTabsGroupSettings,
    serializeGroupsTypeSettings,
} from '@/components/collections/field-settings/type-settings/groups';
import type {
    AccordionGroupSettings,
    DetailGroupSettings,
    TabsGroupSettings,
} from '@/components/collections/field-settings/type-settings/groups';
import {
    parseBooleanFieldSettings,
    serializeBooleanFieldSettings,
} from '@/components/collections/field-settings/type-settings/selection';
import { serializeTextNumbersTypeSettings } from '@/components/collections/field-settings/type-settings/text-numbers';
import { Button } from '@/components/ui/button';
import { DrawerBody, DrawerFooter } from '@/components/ui/drawer';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import {
    buildFieldSettingsPayload,
    fieldTypeGroupForType,
    flattenSettingsForForm,
    isImageFieldMultiple,
    isFilesFieldMultiple,
    parseAllowedCollectionIds,
    parseApiAutocompleteFieldSettings,
    parseBlocksFieldSettings,
    serializeBlocksFieldSettings,
    parseCommonFieldSettings,
    parseFieldOptions,
    parseFieldTreeOptions,
    parseSliderFieldSettings,
    parseSliderSettings,
    parseStringFieldSettings,
} from '@/lib/collection-field-types';
import type {
    ApiAutocompleteFieldSettings,
    BlocksTypeDefinition,
    CommonFieldSettings,
    FieldOptionRow,
    FieldTreeOptionRow,
    RelatedCollectionOption,
    SliderFieldSettings,
    StringFieldSettings,
} from '@/lib/collection-field-types';
import type { FieldConditions } from '@/lib/field-conditions';
import { parseFieldConditions } from '@/lib/field-conditions';
import { wayfinderInertiaFormProps } from '@/lib/wayfinder-form';
import type { CollectionFieldRow } from '@/types';
import { scalarToString } from '@/lib/scalar-to-string';

// Re-exported so the fields page and fields list keep one entry point for the field drawers.
export {
    CollectionFieldTypeDrawer,
    FIELD_TYPE_ICONS,
} from '@/components/collections/field-settings/field-type-picker';

function SettingsHiddenFields({
    settings,
}: {
    settings: Record<string, unknown>;
}) {
    const entries = flattenSettingsForForm(settings);

    return (
        <>
            {entries.map((entry) => (
                <input
                    key={entry.name}
                    type="hidden"
                    name={entry.name}
                    value={entry.value}
                />
            ))}
        </>
    );
}

export type CollectionFieldFormDrawerProps = {
    mode: 'create' | 'edit';
    collectionId: number;
    field?: CollectionFieldRow;
    fieldType: string;
    relatedCollections: RelatedCollectionOption[];
    siblingFieldNames?: string[];
    /** Prefer over DrawerClose so leave goes through requestLeave. */
    onCancel: () => void;
    onSuccess: () => void;
};

/**
 * Drawer form for editing a collection field schema.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function CollectionFieldFormDrawer({
    mode,
    collectionId,
    field,
    fieldType,
    relatedCollections,
    siblingFieldNames = [],
    onCancel,
    onSuccess,
}: CollectionFieldFormDrawerProps) {
    const { t } = useTranslation();
    const [options, setOptions] = useState<FieldOptionRow[]>(() =>
        parseFieldOptions(field?.settings),
    );
    const [treeOptions, setTreeOptions] = useState<FieldTreeOptionRow[]>(() =>
        parseFieldTreeOptions(field?.settings),
    );
    const [relatedCollectionId, setRelatedCollectionId] = useState(() =>
        scalarToString(field?.settings?.related_collection_id, ''),
    );
    const [displayField, setDisplayField] = useState(() =>
        scalarToString(field?.settings?.display_field, 'title'),
    );
    const [commonSettings, setCommonSettings] = useState<CommonFieldSettings>(
        () => parseCommonFieldSettings(field?.settings),
    );
    const [stringSettings, setStringSettings] = useState<StringFieldSettings>(
        () => parseStringFieldSettings(field?.settings),
    );
    const [apiAutocompleteSettings, setApiAutocompleteSettings] =
        useState<ApiAutocompleteFieldSettings>(() =>
            parseApiAutocompleteFieldSettings(field?.settings),
        );
    const [booleanLabels, setBooleanLabels] = useState(() =>
        parseBooleanFieldSettings(field?.settings),
    );
    const [allowMultipleImages, setAllowMultipleImages] = useState(() =>
        isImageFieldMultiple(field?.settings),
    );
    const [allowMultipleFiles, setAllowMultipleFiles] = useState(() =>
        isFilesFieldMultiple(field?.settings),
    );
    const [allowedCollectionIds, setAllowedCollectionIds] = useState<number[]>(
        () => parseAllowedCollectionIds(field?.settings),
    );
    const [blockTypes, setBlockTypes] = useState<BlocksTypeDefinition[]>(
        () => parseBlocksFieldSettings(field?.settings).blockTypes,
    );
    const [maxBlocksDepth, setMaxBlocksDepth] = useState(
        () => parseBlocksFieldSettings(field?.settings).maxBlocksDepth,
    );
    const [sliderSettings, setSliderSettings] = useState<SliderFieldSettings>(
        () => parseSliderSettings(field?.settings),
    );
    const [sliderShowValue, setSliderShowValue] = useState(
        () => parseSliderFieldSettings(field?.settings).showValue,
    );
    const [accordionSettings, setAccordionSettings] =
        useState<AccordionGroupSettings>(() =>
            parseAccordionGroupSettings(field?.settings),
        );
    const [detailSettings, setDetailSettings] = useState<DetailGroupSettings>(
        () => parseDetailGroupSettings(field?.settings),
    );
    const [tabsSettings, setTabsSettings] = useState<TabsGroupSettings>(() =>
        parseTabsGroupSettings(field?.settings),
    );
    const [fieldConditions, setFieldConditions] =
        useState<FieldConditions | null>(() =>
            parseFieldConditions(field?.settings),
        );

    const settingsPayload = useMemo(() => {
        const typeSettings: Record<string, unknown> = {
            ...serializeTextNumbersTypeSettings(
                fieldType,
                stringSettings,
                apiAutocompleteSettings,
            ),
            ...serializeBooleanFieldSettings(booleanLabels),
        };

        if (fieldTypeGroupForType(fieldType) === 'relational') {
            if (relatedCollectionId) {
                typeSettings.related_collection_id = relatedCollectionId;
            }

            if (displayField) {
                typeSettings.display_field = displayField;
            }

            if (fieldType === 'image') {
                typeSettings.allow_multiple = allowMultipleImages ? '1' : '0';
            }

            if (fieldType === 'files') {
                typeSettings.allow_multiple = allowMultipleFiles ? '1' : '0';
            }

            if (fieldType === 'm2a') {
                typeSettings.allowed_collection_ids = allowedCollectionIds;
            }
        }

        if (fieldType === 'blocks') {
            typeSettings.max_blocks_depth = maxBlocksDepth;
            typeSettings.block_types = serializeBlocksFieldSettings(
                blockTypes,
                1,
                maxBlocksDepth,
            );
        }

        if (fieldType === 'slider') {
            Object.assign(typeSettings, {
                min: sliderSettings.min,
                max: sliderSettings.max,
                step: sliderSettings.step,
                default_value: sliderSettings.defaultValue,
                show_value: sliderShowValue ? '1' : '0',
            });
        }

        Object.assign(
            typeSettings,
            serializeGroupsTypeSettings(
                fieldType,
                accordionSettings,
                detailSettings,
                tabsSettings,
            ),
        );

        const payload = buildFieldSettingsPayload(
            fieldType,
            commonSettings,
            typeSettings,
            options,
            treeOptions,
        );

        if (fieldConditions) {
            payload.conditions = fieldConditions;
        }

        return payload;
    }, [
        allowMultipleImages,
        allowMultipleFiles,
        allowedCollectionIds,
        apiAutocompleteSettings,
        accordionSettings,
        blockTypes,
        maxBlocksDepth,
        booleanLabels,
        commonSettings,
        detailSettings,
        tabsSettings,
        displayField,
        fieldConditions,
        fieldType,
        options,
        relatedCollectionId,
        sliderSettings,
        sliderShowValue,
        stringSettings,
        treeOptions,
    ]);

    // ponytail: snapshot compare for settings; Form onInput catches field key / native inputs
    const [initialSettingsSnapshot, setInitialSettingsSnapshot] = useState(() =>
        JSON.stringify(settingsPayload),
    );
    const [inputDirty, setInputDirty] = useState(false);
    const isDirty =
        inputDirty ||
        JSON.stringify(settingsPayload) !== initialSettingsSnapshot;

    useRegisterUnsavedChanges({
        scope: 'drawer',
        isDirty,
        onDiscard: () => setInputDirty(false),
    });

    const formProps =
        mode === 'create'
            ? wayfinderInertiaFormProps(
                  FieldController.store,
                  { collection: collectionId },
                  'post',
              )
            : wayfinderInertiaFormProps(
                  FieldController.update,
                  {
                      collection: collectionId,
                      field: field!.id,
                  },
                  'patch',
              );

    const headerSubtitle =
        mode === 'edit' && field !== undefined
            ? t('collections.fieldSettings.form.updateSubtitle', {
                  name: field.name,
              })
            : undefined;

    return (
        <>
            <FieldTypeHeader fieldType={fieldType} subtitle={headerSubtitle} />

            <Form
                {...formProps}
                key={field?.id ?? `new-${fieldType}`}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
                options={{ preserveScroll: true }}
                onSuccess={() => {
                    // flushSync: parent onSuccess closes drawer + deepLink GET before
                    // the next paint; without it the leave guard still sees dirty.
                    flushSync(() => {
                        setInputDirty(false);
                        setInitialSettingsSnapshot(
                            JSON.stringify(settingsPayload),
                        );
                    });
                    onSuccess();
                }}
                onInput={() => setInputDirty(true)}
                onChange={() => setInputDirty(true)}
            >
                {({ processing, errors }) => (
                    <>
                        <input type="hidden" name="type" value={fieldType} />
                        <SettingsHiddenFields settings={settingsPayload} />

                        <DrawerBody className="flex flex-col gap-8">
                            <FieldConfigPanel
                                mode={mode}
                                fieldType={fieldType}
                                field={field}
                                errors={errors}
                                commonSettings={commonSettings}
                                onCommonSettingsChange={setCommonSettings}
                                stringSettings={stringSettings}
                                onStringSettingsChange={setStringSettings}
                                apiAutocompleteSettings={
                                    apiAutocompleteSettings
                                }
                                onApiAutocompleteSettingsChange={
                                    setApiAutocompleteSettings
                                }
                                booleanLabels={booleanLabels}
                                onBooleanLabelsChange={setBooleanLabels}
                                options={options}
                                onOptionsChange={setOptions}
                                treeOptions={treeOptions}
                                onTreeOptionsChange={setTreeOptions}
                                relatedCollections={relatedCollections}
                                relatedCollectionId={relatedCollectionId}
                                displayField={displayField}
                                onRelatedCollectionIdChange={
                                    setRelatedCollectionId
                                }
                                onDisplayFieldChange={setDisplayField}
                                allowMultipleImages={allowMultipleImages}
                                onAllowMultipleImagesChange={
                                    setAllowMultipleImages
                                }
                                allowMultipleFiles={allowMultipleFiles}
                                onAllowMultipleFilesChange={
                                    setAllowMultipleFiles
                                }
                                allowedCollectionIds={allowedCollectionIds}
                                onAllowedCollectionIdsChange={
                                    setAllowedCollectionIds
                                }
                                blockTypes={blockTypes}
                                onBlockTypesChange={setBlockTypes}
                                maxBlocksDepth={maxBlocksDepth}
                                onMaxBlocksDepthChange={setMaxBlocksDepth}
                                sliderSettings={sliderSettings}
                                onSliderSettingsChange={setSliderSettings}
                                sliderShowValue={sliderShowValue}
                                onSliderShowValueChange={setSliderShowValue}
                                accordionSettings={accordionSettings}
                                onAccordionSettingsChange={setAccordionSettings}
                                detailSettings={detailSettings}
                                onDetailSettingsChange={setDetailSettings}
                                tabsSettings={tabsSettings}
                                onTabsSettingsChange={setTabsSettings}
                                siblingFieldNames={siblingFieldNames.filter(
                                    (name) => name !== field?.name,
                                )}
                                fieldConditions={fieldConditions}
                                onFieldConditionsChange={setFieldConditions}
                            />
                        </DrawerBody>

                        <DrawerFooter className="flex flex-row justify-end gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onCancel}
                            >
                                {t('common.cancel')}
                            </Button>
                            <Button type="submit" disabled={processing}>
                                {mode === 'create'
                                    ? t('collections.createField')
                                    : t('collections.saveField')}
                            </Button>
                        </DrawerFooter>
                    </>
                )}
            </Form>
        </>
    );
}

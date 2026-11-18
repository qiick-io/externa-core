import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CommonAdvancedSettings } from '@/components/collections/field-settings/common-advanced-settings';
import { FieldConditionsSettings } from '@/components/collections/field-settings/field-conditions-settings';
import {
    SettingsDivider,
    SettingsPanel,
} from '@/components/collections/field-settings/settings-layout';
import { TranslatedInput } from '@/components/collections/field-settings/translated-input';
import { AltroSettings } from '@/components/collections/field-settings/type-settings/altro';
import { BlocksSettingsEditor } from '@/components/collections/field-settings/type-settings/blocks-settings-editor';
import { GroupsSettings } from '@/components/collections/field-settings/type-settings/groups';
import type {
    AccordionGroupSettings,
    DetailGroupSettings,
    TabsGroupSettings,
} from '@/components/collections/field-settings/type-settings/groups';
import {
    OptionsEditor,
    TreeOptionsEditor,
} from '@/components/collections/field-settings/type-settings/options-editors';
import { RelationalSettings } from '@/components/collections/field-settings/type-settings/relational';
import { SelectionSettings } from '@/components/collections/field-settings/type-settings/selection';
import type { parseBooleanFieldSettings } from '@/components/collections/field-settings/type-settings/selection';
import { TextNumbersSettings } from '@/components/collections/field-settings/type-settings/text-numbers';
import { useDebouncedFieldKeyError } from '@/components/collections/field-settings/use-debounced-field-key-error';
import { ValidationRuleBuilder } from '@/components/collections/field-settings/validation-rule-builder';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldError,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    fieldTypeGroupForType,
    fieldTypeLabel,
    fieldTypeNeedsBlocksSettings,
    fieldTypeNeedsOptions,
    fieldTypeNeedsTreeOptions,
    fieldTypeSupportsTranslatable,
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
import { FIELD_KEY_PATTERN, slugify, slugifyInput } from '@/lib/slugify';
import type { CollectionFieldRow } from '@/types';

type FieldConfigPanelProps = {
    mode: 'create' | 'edit';
    fieldType: string;
    field?: CollectionFieldRow;
    errors: Record<string, string | undefined>;
    commonSettings: CommonFieldSettings;
    onCommonSettingsChange: (
        updater: (current: CommonFieldSettings) => CommonFieldSettings,
    ) => void;
    stringSettings: StringFieldSettings;
    onStringSettingsChange: (
        updater: (current: StringFieldSettings) => StringFieldSettings,
    ) => void;
    apiAutocompleteSettings: ApiAutocompleteFieldSettings;
    onApiAutocompleteSettingsChange: (
        updater: (
            current: ApiAutocompleteFieldSettings,
        ) => ApiAutocompleteFieldSettings,
    ) => void;
    booleanLabels: ReturnType<typeof parseBooleanFieldSettings>;
    onBooleanLabelsChange: (
        next: ReturnType<typeof parseBooleanFieldSettings>,
    ) => void;
    options: FieldOptionRow[];
    onOptionsChange: (next: FieldOptionRow[]) => void;
    treeOptions: FieldTreeOptionRow[];
    onTreeOptionsChange: (next: FieldTreeOptionRow[]) => void;
    relatedCollections: RelatedCollectionOption[];
    relatedCollectionId: string;
    displayField: string;
    onRelatedCollectionIdChange: (value: string) => void;
    onDisplayFieldChange: (value: string) => void;
    allowMultipleImages: boolean;
    onAllowMultipleImagesChange: (value: boolean) => void;
    allowMultipleFiles: boolean;
    onAllowMultipleFilesChange: (value: boolean) => void;
    allowedCollectionIds: number[];
    onAllowedCollectionIdsChange: (next: number[]) => void;
    blockTypes: BlocksTypeDefinition[];
    onBlockTypesChange: (next: BlocksTypeDefinition[]) => void;
    maxBlocksDepth: number;
    onMaxBlocksDepthChange: (next: number) => void;
    sliderSettings: SliderFieldSettings;
    onSliderSettingsChange: (
        updater: (current: SliderFieldSettings) => SliderFieldSettings,
    ) => void;
    sliderShowValue: boolean;
    onSliderShowValueChange: (value: boolean) => void;
    accordionSettings: AccordionGroupSettings;
    onAccordionSettingsChange: (
        updater: (current: AccordionGroupSettings) => AccordionGroupSettings,
    ) => void;
    detailSettings: DetailGroupSettings;
    onDetailSettingsChange: (
        updater: (current: DetailGroupSettings) => DetailGroupSettings,
    ) => void;
    tabsSettings: TabsGroupSettings;
    onTabsSettingsChange: (
        updater: (current: TabsGroupSettings) => TabsGroupSettings,
    ) => void;
    siblingFieldNames: string[];
    fieldConditions: FieldConditions | null;
    onFieldConditionsChange: (next: FieldConditions | null) => void;
};

/**
 * Body of the field settings drawer: general settings, the type-specific
 * section of the field type, behaviour, conditions and validation.
 */
export function FieldConfigPanel({
    mode,
    fieldType,
    field,
    errors,
    commonSettings,
    onCommonSettingsChange,
    stringSettings,
    onStringSettingsChange,
    apiAutocompleteSettings,
    onApiAutocompleteSettingsChange,
    booleanLabels,
    onBooleanLabelsChange,
    options,
    onOptionsChange,
    treeOptions,
    onTreeOptionsChange,
    relatedCollections,
    relatedCollectionId,
    displayField,
    onRelatedCollectionIdChange,
    onDisplayFieldChange,
    allowMultipleImages,
    onAllowMultipleImagesChange,
    allowMultipleFiles,
    onAllowMultipleFilesChange,
    allowedCollectionIds,
    onAllowedCollectionIdsChange,
    blockTypes,
    onBlockTypesChange,
    maxBlocksDepth,
    onMaxBlocksDepthChange,
    sliderSettings,
    onSliderSettingsChange,
    sliderShowValue,
    onSliderShowValueChange,
    accordionSettings,
    onAccordionSettingsChange,
    detailSettings,
    onDetailSettingsChange,
    tabsSettings,
    onTabsSettingsChange,
    siblingFieldNames,
    fieldConditions,
    onFieldConditionsChange,
}: FieldConfigPanelProps) {
    const { t } = useTranslation();
    const typeGroup = fieldTypeGroupForType(fieldType);
    const [fieldKey, setFieldKey] = useState(field?.name ?? '');
    const debouncedKeyError = useDebouncedFieldKeyError(
        fieldKey,
        siblingFieldNames,
    );

    const nestedSettingsErrors = useMemo(
        () =>
            Object.entries(errors)
                .filter(
                    ([key, message]) =>
                        key.startsWith('settings.') && Boolean(message),
                )
                .map(([, message]) => message as string),
        [errors],
    );

    const keyError = errors.name ?? debouncedKeyError;

    const typeSpecificContent = (
        <>
            {fieldTypeNeedsOptions(fieldType) &&
                !fieldTypeNeedsTreeOptions(fieldType) && (
                    <OptionsEditor
                        options={options}
                        onChange={onOptionsChange}
                    />
                )}

            {fieldTypeNeedsTreeOptions(fieldType) && (
                <TreeOptionsEditor
                    options={treeOptions}
                    onChange={onTreeOptionsChange}
                />
            )}

            {fieldTypeNeedsBlocksSettings(fieldType) ? (
                <BlocksSettingsEditor
                    blockTypes={blockTypes}
                    onChange={onBlockTypesChange}
                    maxDepth={maxBlocksDepth}
                    onMaxDepthChange={onMaxBlocksDepthChange}
                    relatedCollections={relatedCollections}
                />
            ) : null}

            {typeGroup === 'text_numbers' ? (
                <TextNumbersSettings
                    fieldType={fieldType}
                    settings={field?.settings}
                    stringSettings={stringSettings}
                    onStringSettingsChange={onStringSettingsChange}
                    apiAutocompleteSettings={apiAutocompleteSettings}
                    onApiAutocompleteSettingsChange={
                        onApiAutocompleteSettingsChange
                    }
                />
            ) : null}

            {typeGroup === 'selection' ? (
                <SelectionSettings
                    fieldType={fieldType}
                    settings={field?.settings}
                    booleanLabels={booleanLabels}
                    onBooleanLabelsChange={onBooleanLabelsChange}
                />
            ) : null}

            {typeGroup === 'relational' ? (
                <RelationalSettings
                    fieldType={fieldType}
                    settings={field?.settings}
                    relatedCollections={relatedCollections}
                    relatedCollectionId={relatedCollectionId}
                    displayField={displayField}
                    onRelatedCollectionIdChange={onRelatedCollectionIdChange}
                    onDisplayFieldChange={onDisplayFieldChange}
                    allowMultipleImages={allowMultipleImages}
                    onAllowMultipleImagesChange={onAllowMultipleImagesChange}
                    allowMultipleFiles={allowMultipleFiles}
                    onAllowMultipleFilesChange={onAllowMultipleFilesChange}
                    allowedCollectionIds={allowedCollectionIds}
                    onAllowedCollectionIdsChange={onAllowedCollectionIdsChange}
                />
            ) : null}

            {typeGroup === 'other' ? (
                <AltroSettings
                    fieldType={fieldType}
                    settings={field?.settings}
                    sliderSettings={sliderSettings}
                    onSliderSettingsChange={onSliderSettingsChange}
                    sliderShowValue={sliderShowValue}
                    onSliderShowValueChange={onSliderShowValueChange}
                />
            ) : null}

            {typeGroup === 'groups' ? (
                <GroupsSettings
                    fieldType={fieldType}
                    accordionSettings={accordionSettings}
                    onAccordionSettingsChange={onAccordionSettingsChange}
                    detailSettings={detailSettings}
                    onDetailSettingsChange={onDetailSettingsChange}
                    tabsSettings={tabsSettings}
                    onTabsSettingsChange={onTabsSettingsChange}
                />
            ) : null}
        </>
    );

    const hasTypeSpecificSettings =
        (fieldTypeNeedsOptions(fieldType) &&
            !fieldTypeNeedsTreeOptions(fieldType)) ||
        fieldTypeNeedsTreeOptions(fieldType) ||
        fieldTypeNeedsBlocksSettings(fieldType) ||
        typeGroup === 'text_numbers' ||
        typeGroup === 'selection' ||
        typeGroup === 'relational' ||
        typeGroup === 'other' ||
        typeGroup === 'groups';

    return (
        <div className="space-y-6">
            <SettingsPanel
                title={t('collections.general')}
                description={t('collections.generalDescription')}
            >
                <div className="space-y-6">
                    <Field data-invalid={keyError ? true : undefined}>
                        <FieldLabel htmlFor={`field_name_${mode}`}>
                            {t('collections.fieldSettings.form.key')}{' '}
                            <span className="text-destructive">{'*'}</span>
                        </FieldLabel>
                        <Input
                            id={`field_name_${mode}`}
                            name="name"
                            required
                            value={fieldKey}
                            onChange={(event) =>
                                setFieldKey(slugifyInput(event.target.value))
                            }
                            onBlur={() =>
                                setFieldKey((current) =>
                                    // Keep legacy underscore keys until the user edits them.
                                    FIELD_KEY_PATTERN.test(current)
                                        ? current
                                        : slugify(current),
                                )
                            }
                            placeholder="my-field"
                            pattern="[a-z0-9]+(?:[-_][a-z0-9]+)*"
                            className="w-full"
                            aria-invalid={Boolean(keyError)}
                            aria-describedby={
                                keyError
                                    ? `field-name-${mode}-error`
                                    : undefined
                            }
                        />
                        <FieldError id={`field-name-${mode}-error`}>
                            {keyError}
                        </FieldError>
                    </Field>

                    <TranslatedInput
                        idPrefix={`display_name_${mode}`}
                        label={t('common.name')}
                        description={t(
                            'collections.fieldSettings.form.nameHint',
                        )}
                        value={commonSettings.displayName}
                        onChange={(displayName) =>
                            onCommonSettingsChange((current) => ({
                                ...current,
                                displayName,
                            }))
                        }
                    />

                    {fieldTypeSupportsTranslatable(fieldType) ? (
                        <TranslatableField mode={mode} field={field} />
                    ) : (
                        <input type="hidden" name="translatable" value="0" />
                    )}

                    <TranslatedInput
                        idPrefix={`note_${mode}`}
                        label={t('collections.fieldSettings.form.note')}
                        description={t(
                            'collections.fieldSettings.form.noteHint',
                        )}
                        value={commonSettings.note}
                        onChange={(note) =>
                            onCommonSettingsChange((current) => ({
                                ...current,
                                note,
                            }))
                        }
                    />
                </div>
            </SettingsPanel>

            <SettingsDivider label={t('collections.advanced')} />

            {hasTypeSpecificSettings ? (
                <SettingsPanel
                    title={t('collections.typeSettings', {
                        type: fieldTypeLabel(fieldType, t),
                    })}
                    description={t('collections.typeSettingsDescription')}
                >
                    <div className="space-y-6">{typeSpecificContent}</div>
                </SettingsPanel>
            ) : null}

            <SettingsPanel title={t('collections.fieldBehavior')}>
                <CommonAdvancedSettings
                    fieldType={fieldType}
                    settings={commonSettings}
                    onChange={onCommonSettingsChange}
                />
            </SettingsPanel>

            <SettingsPanel
                title={t('collections.conditions')}
                description={t('collections.conditionsDescription')}
            >
                <FieldConditionsSettings
                    settings={field?.settings}
                    siblingFieldNames={siblingFieldNames}
                    value={fieldConditions}
                    onChange={onFieldConditionsChange}
                />
            </SettingsPanel>

            <SettingsPanel
                title={t('collections.validation')}
                description={t('collections.validationDescription')}
            >
                <ValidationRuleBuilder
                    rules={commonSettings.validationRules}
                    validationMessage={commonSettings.validationMessage}
                    onRulesChange={(validationRules) =>
                        onCommonSettingsChange((current) => ({
                            ...current,
                            validationRules,
                        }))
                    }
                    onValidationMessageChange={(validationMessage) =>
                        onCommonSettingsChange((current) => ({
                            ...current,
                            validationMessage,
                        }))
                    }
                />
            </SettingsPanel>

            <FieldError id={`field-type-${mode}-error`}>
                {errors.type}
            </FieldError>
            <FieldError id={`field-settings-${mode}-error`}>
                {errors.settings}
            </FieldError>
            <FieldError id={`field-translatable-${mode}-error`}>
                {errors.translatable}
            </FieldError>
            {nestedSettingsErrors.map((message) => (
                <FieldError key={message}>{message}</FieldError>
            ))}
        </div>
    );
}

/** Translatable checkbox; locked once an existing field has stored values. */
function TranslatableField({
    mode,
    field,
}: {
    mode: 'create' | 'edit';
    field?: CollectionFieldRow;
}) {
    const { t } = useTranslation();
    const isLocked = mode === 'edit' && Boolean(field?.has_stored_values);
    const isChecked = field?.translatable ?? false;

    const checkboxId = `translatable_${mode}`;

    return (
        <Field
            orientation="horizontal"
            data-disabled={isLocked || undefined}
            className="gap-4"
        >
            {/* Unchecked boxes submit nothing: the hidden input keeps "0" (and the locked value). */}
            <input
                type="hidden"
                name="translatable"
                value={isLocked && isChecked ? '1' : '0'}
            />
            {isLocked ? (
                <Checkbox id={checkboxId} checked={isChecked} disabled />
            ) : (
                <Checkbox
                    id={checkboxId}
                    name="translatable"
                    value="1"
                    defaultChecked={isChecked}
                />
            )}
            <FieldContent>
                <FieldLabel htmlFor={checkboxId}>
                    {t('collections.translatable')}
                </FieldLabel>
                <FieldDescription>
                    {isLocked
                        ? t('collections.translatableLockedHintConvert')
                        : t('collections.translatableDescription')}
                </FieldDescription>
            </FieldContent>
        </Field>
    );
}

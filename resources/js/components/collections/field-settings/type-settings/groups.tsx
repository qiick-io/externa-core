import { useTranslation } from 'react-i18next';
import { SettingCheckbox } from '@/components/collections/field-settings/settings-layout';
import { Field, FieldLabel } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/native-select';

export type AccordionGroupSettings = {
    accordionMode: boolean;
    start: 'closed' | 'first' | 'opened';
};

export type DetailGroupSettings = {
    start: 'open' | 'closed';
};

export type TabsGroupSettings = {
    fillWidth: boolean;
};

type GroupsSettingsProps = {
    fieldType: string;
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
};

/**
 * Type-specific settings for layout group fields.
 */
export function GroupsSettings({
    fieldType,
    accordionSettings,
    onAccordionSettingsChange,
    detailSettings,
    onDetailSettingsChange,
    tabsSettings,
    onTabsSettingsChange,
}: GroupsSettingsProps) {
    const { t } = useTranslation();

    if (fieldType === 'group_accordion') {
        const startChoices: Array<{
            value: AccordionGroupSettings['start'];
            label: string;
        }> = accordionSettings.accordionMode
            ? [
                  {
                      value: 'closed',
                      label: t('collections.fieldSettings.groups.allClosed'),
                  },
                  {
                      value: 'first',
                      label: t('collections.fieldSettings.groups.firstOpen'),
                  },
              ]
            : [
                  {
                      value: 'closed',
                      label: t('collections.fieldSettings.groups.allClosed'),
                  },
                  {
                      value: 'first',
                      label: t('collections.fieldSettings.groups.firstOpen'),
                  },
                  {
                      value: 'opened',
                      label: t('collections.fieldSettings.groups.allOpen'),
                  },
              ];

        return (
            <div className="space-y-6">
                <SettingCheckbox
                    id="accordion_mode"
                    label={t('collections.fieldSettings.groups.maxOneOpen')}
                    description={t(
                        'collections.fieldSettings.groups.maxOneOpenHint',
                    )}
                    checked={accordionSettings.accordionMode}
                    onCheckedChange={(checked) =>
                        onAccordionSettingsChange((current) => ({
                            accordionMode: checked,
                            // "all open" is only available when accordion mode is off.
                            start:
                                checked && current.start === 'opened'
                                    ? 'closed'
                                    : current.start,
                        }))
                    }
                />
                <Field>
                    <FieldLabel htmlFor="accordion_start">
                        {t('collections.fieldSettings.groups.initialState')}
                    </FieldLabel>
                    <NativeSelect
                        id="accordion_start"
                        value={
                            accordionSettings.accordionMode &&
                            accordionSettings.start === 'opened'
                                ? 'closed'
                                : accordionSettings.start
                        }
                        onChange={(event) =>
                            onAccordionSettingsChange((current) => ({
                                ...current,
                                start: event.target
                                    .value as AccordionGroupSettings['start'],
                            }))
                        }
                        className="w-full"
                    >
                        {startChoices.map((choice) => (
                            <option key={choice.value} value={choice.value}>
                                {choice.label}
                            </option>
                        ))}
                    </NativeSelect>
                </Field>
                <p className="text-sm text-muted-foreground">
                    {t('collections.fieldSettings.groups.accordionHint')}
                </p>
            </div>
        );
    }

    if (fieldType === 'group_detail') {
        return (
            <div className="space-y-6">
                <Field>
                    <FieldLabel htmlFor="detail_start">
                        {t('collections.fieldSettings.groups.initialState')}
                    </FieldLabel>
                    <NativeSelect
                        id="detail_start"
                        value={detailSettings.start}
                        onChange={(event) =>
                            onDetailSettingsChange((current) => ({
                                ...current,
                                start: event.target
                                    .value as DetailGroupSettings['start'],
                            }))
                        }
                        className="w-full"
                    >
                        <option value="open">
                            {t('collections.fieldSettings.groups.open')}
                        </option>
                        <option value="closed">
                            {t('collections.fieldSettings.groups.closed')}
                        </option>
                    </NativeSelect>
                </Field>
            </div>
        );
    }

    if (fieldType === 'group_tabs') {
        return (
            <div className="space-y-6">
                <SettingCheckbox
                    id="tabs_fill_width"
                    label={t('collections.layoutWidth.fill')}
                    description={t(
                        'collections.fieldSettings.groups.fillWidthHint',
                    )}
                    checked={tabsSettings.fillWidth}
                    onCheckedChange={(checked) =>
                        onTabsSettingsChange((current) => ({
                            ...current,
                            fillWidth: checked,
                        }))
                    }
                />
                <p className="text-sm text-muted-foreground">
                    {t('collections.fieldSettings.groups.tabsHint')}
                </p>
            </div>
        );
    }

    if (fieldType === 'group_raw') {
        return (
            <p className="text-sm text-muted-foreground">
                {t('collections.fieldSettings.groups.rawHint')}
            </p>
        );
    }

    return null;
}

function settingsFlagEnabled(value: unknown): boolean {
    return (
        value === true ||
        value === 1 ||
        value === '1' ||
        value === 'true' ||
        value === 'on'
    );
}

function settingsFlagExplicitlyDisabled(value: unknown): boolean {
    return (
        value === false ||
        value === 0 ||
        value === '0' ||
        value === 'false' ||
        value === 'off'
    );
}

export function parseAccordionGroupSettings(
    settings?: Record<string, unknown> | null,
): AccordionGroupSettings {
    const start = settings?.start;
    // Default: accordionMode true when unset.
    const accordionMode = settingsFlagExplicitlyDisabled(
        settings?.accordion_mode,
    )
        ? false
        : settings?.accordion_mode === undefined ||
            settings?.accordion_mode === null
          ? true
          : settingsFlagEnabled(settings?.accordion_mode);

    let resolvedStart: AccordionGroupSettings['start'] =
        start === 'first' || start === 'opened' || start === 'closed'
            ? start
            : 'closed';

    if (accordionMode && resolvedStart === 'opened') {
        resolvedStart = 'closed';
    }

    return {
        accordionMode,
        start: resolvedStart,
    };
}

export function parseDetailGroupSettings(
    settings?: Record<string, unknown> | null,
): DetailGroupSettings {
    const start = settings?.start;

    return {
        start: start === 'closed' ? 'closed' : 'open',
    };
}

export function parseTabsGroupSettings(
    settings?: Record<string, unknown> | null,
): TabsGroupSettings {
    return {
        fillWidth: settingsFlagEnabled(settings?.fill_width),
    };
}

export function serializeGroupsTypeSettings(
    fieldType: string,
    accordionSettings: AccordionGroupSettings,
    detailSettings: DetailGroupSettings,
    tabsSettings: TabsGroupSettings = { fillWidth: false },
): Record<string, unknown> {
    if (fieldType === 'group_accordion') {
        const start =
            accordionSettings.accordionMode &&
            accordionSettings.start === 'opened'
                ? 'closed'
                : accordionSettings.start;

        return {
            accordion_mode: accordionSettings.accordionMode ? '1' : '0',
            start,
            layout_width: 'full',
        };
    }

    if (fieldType === 'group_detail') {
        return {
            start: detailSettings.start,
            layout_width: 'full',
        };
    }

    if (fieldType === 'group_tabs') {
        return {
            fill_width: tabsSettings.fillWidth ? '1' : '0',
            layout_width: 'full',
        };
    }

    if (fieldType === 'group_raw') {
        return { layout_width: 'full' };
    }

    return {};
}

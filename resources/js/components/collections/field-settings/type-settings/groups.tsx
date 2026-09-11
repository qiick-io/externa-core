import { SettingCheckbox } from '@/components/collections/field-settings/settings-layout';
import { Label } from '@/components/ui/label';

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
 * Type-specific settings for layout group fields (Directus group-* parity).
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
    if (fieldType === 'group_accordion') {
        const startChoices: Array<{
            value: AccordionGroupSettings['start'];
            label: string;
        }> = accordionSettings.accordionMode
            ? [
                  { value: 'closed', label: 'All closed' },
                  { value: 'first', label: 'First open' },
              ]
            : [
                  { value: 'closed', label: 'All closed' },
                  { value: 'first', label: 'First open' },
                  { value: 'opened', label: 'All open' },
              ];

        return (
            <div className="space-y-5">
                <SettingCheckbox
                    id="accordion_mode"
                    label="Max one section open"
                    description="Only one accordion section can be expanded at a time."
                    checked={accordionSettings.accordionMode}
                    onCheckedChange={(checked) =>
                        onAccordionSettingsChange((current) => ({
                            accordionMode: checked,
                            // Directus: "all open" is only available when accordion mode is off.
                            start:
                                checked && current.start === 'opened'
                                    ? 'closed'
                                    : current.start,
                        }))
                    }
                />
                <div className="grid gap-2">
                    <Label htmlFor="accordion_start">Initial state</Label>
                    <select
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
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs"
                    >
                        {startChoices.map((choice) => (
                            <option key={choice.value} value={choice.value}>
                                {choice.label}
                            </option>
                        ))}
                    </select>
                </div>
                <p className="text-sm text-muted-foreground">
                    Sections are typically Raw groups nested under this
                    accordion (two empty ones are created automatically). Use
                    Add section on the accordion, or nest any field — including
                    leaves — directly (Directus: leaf children become accordion
                    panels).
                </p>
            </div>
        );
    }

    if (fieldType === 'group_detail') {
        return (
            <div className="space-y-5">
                <div className="grid gap-2">
                    <Label htmlFor="detail_start">Initial state</Label>
                    <select
                        id="detail_start"
                        value={detailSettings.start}
                        onChange={(event) =>
                            onDetailSettingsChange((current) => ({
                                ...current,
                                start: event.target
                                    .value as DetailGroupSettings['start'],
                            }))
                        }
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs"
                    >
                        <option value="open">Open</option>
                        <option value="closed">Closed</option>
                    </select>
                </div>
            </div>
        );
    }

    if (fieldType === 'group_tabs') {
        return (
            <div className="space-y-5">
                <SettingCheckbox
                    id="tabs_fill_width"
                    label="Fill width"
                    description="Span the full form width (overwrite nested group width)."
                    checked={tabsSettings.fillWidth}
                    onCheckedChange={(checked) =>
                        onTabsSettingsChange((current) => ({
                            ...current,
                            fillWidth: checked,
                        }))
                    }
                />
                <p className="text-sm text-muted-foreground">
                    Tab panels are typically Raw groups nested under this tabs
                    group (two empty ones are created automatically). Use Add
                    tab, or nest any field — including leaves — directly
                    (Directus: leaf children become tabs).
                </p>
            </div>
        );
    }

    if (fieldType === 'group_raw') {
        return (
            <p className="text-sm text-muted-foreground">
                Nesting only — no chrome on the item form. Nest fields into this
                group from the fields list (drag and drop).
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
    // Directus default: accordionMode true when unset.
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

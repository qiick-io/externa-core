import { useTranslation } from 'react-i18next';
import {
    Field,
    FieldContent,
    FieldError,
    FieldLabel,
    FieldTitle,
} from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { contrastingForeground } from '@/lib/contrasting-foreground';
import type { ThemePresetCatalogItem, ThemePresetSlug } from '@/types';

/** Translation keys for the built-in preset names (en / de / it). */
const PRESET_NAME_KEYS: Record<ThemePresetSlug, string> = {
    teal: 'settings.appearance.themePresetTeal',
    indigo: 'settings.appearance.themePresetIndigo',
    violet: 'settings.appearance.themePresetViolet',
    rose: 'settings.appearance.themePresetRose',
    slate: 'settings.appearance.themePresetSlate',
};

type ThemePresetFieldProps = {
    /** Presets offered by the server (`appearance.theme_presets`). */
    catalog: ThemePresetCatalogItem[];
    value: ThemePresetSlug;
    onChange: (value: ThemePresetSlug) => void;
    error?: string;
};

/**
 * Theme preset picker for the Appearance settings form (#243, #437).
 *
 * Renders one radio choice card per preset with light and dark swatches, and
 * submits the selection as the `theme_preset` form field.
 */
export function ThemePresetField({
    catalog,
    value,
    onChange,
    error,
}: ThemePresetFieldProps) {
    const { t } = useTranslation();

    return (
        <Field data-invalid={error ? true : undefined}>
            <input type="hidden" name="theme_preset" value={value} />
            <RadioGroup
                value={value}
                onValueChange={(nextValue) => {
                    const preset = catalog.find(
                        (item) => item.slug === nextValue,
                    );

                    if (preset) {
                        onChange(preset.slug);
                    }
                }}
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                aria-label={t('settings.appearance.themePresetTitle')}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'theme-preset-error' : undefined}
            >
                {catalog.map((preset) => (
                    <FieldLabel
                        key={preset.slug}
                        htmlFor={`theme-preset-${preset.slug}`}
                        className="cursor-pointer"
                    >
                        <Field orientation="horizontal">
                            <RadioGroupItem
                                id={`theme-preset-${preset.slug}`}
                                value={preset.slug}
                                aria-labelledby={`theme-preset-${preset.slug}-name`}
                            />
                            <FieldContent>
                                <FieldTitle
                                    id={`theme-preset-${preset.slug}-name`}
                                >
                                    {t(PRESET_NAME_KEYS[preset.slug])}
                                </FieldTitle>
                                <div className="flex gap-2" aria-hidden="true">
                                    <PresetSwatch
                                        color={preset.swatchLight}
                                        label={t(
                                            'settings.appearance.presetPreviewLight',
                                        )}
                                    />
                                    <PresetSwatch
                                        color={preset.swatchDark}
                                        label={t(
                                            'settings.appearance.presetPreviewDark',
                                        )}
                                    />
                                </div>
                            </FieldContent>
                        </Field>
                    </FieldLabel>
                ))}
            </RadioGroup>
            <FieldError id="theme-preset-error">{error}</FieldError>
        </Field>
    );
}

/**
 * Decorative primary swatch; text colour is picked for WCAG contrast.
 */
function PresetSwatch({ color, label }: { color: string; label: string }) {
    return (
        <span
            className="flex h-8 flex-1 items-center justify-center rounded-md text-xs font-medium"
            style={{
                backgroundColor: color,
                color: contrastingForeground(color) ?? undefined,
            }}
        >
            {label}
        </span>
    );
}

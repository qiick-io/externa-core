import { Form, Head, usePage } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';
import type { SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import AppearanceSettingsController from '@/actions/App/Http/Controllers/Settings/AppearanceSettingsController';
import { FilePickerDrawer } from '@/components/admin/file-picker-drawer';
import Heading from '@/components/heading';
import { SettingsFormActions } from '@/components/settings-form-actions';
import { Button } from '@/components/ui/button';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { brandPassesAa } from '@/lib/brand-contrast';
import { applyThemeCss, buildPreviewThemeCss } from '@/lib/theme-css';
import { DEFAULT_THEME_PRESET, themePresetBySlug } from '@/lib/theme-presets';
import type { ThemePresetSlug } from '@/lib/theme-presets';
import { edit as editAppearance } from '@/routes/appearance';
import type {
    AppearanceFileMeta,
    AppearanceSettings,
    BreadcrumbItem,
    ProjectAppearance,
} from '@/types';
import type { AdminFileRow } from '@/types/files';

type FileFieldKey = 'project_logo' | 'project_logo_dark' | 'public_favicon';

const PRESET_NAME_KEYS: Record<ThemePresetSlug, string> = {
    teal: 'settings.appearance.themePresetTeal',
    indigo: 'settings.appearance.themePresetIndigo',
    violet: 'settings.appearance.themePresetViolet',
    rose: 'settings.appearance.themePresetRose',
    slate: 'settings.appearance.themePresetSlate',
};

/**
 * Restore saved theme CSS from shared Inertia props on leave.
 */
function restoreThemeFromAppearance(
    appearance: ProjectAppearance | undefined,
): void {
    if (appearance?.themeCss) {
        applyThemeCss(appearance.themeCss);
    }
}

/**
 * Project branding and default theme settings.
 */
export default function Appearance({
    appearance,
}: {
    appearance: AppearanceSettings;
}) {
    const { t } = useTranslation();
    const { projectAppearance } = usePage().props;

    const catalog = appearance.theme_presets;
    const initialPreset = appearance.theme_preset ?? DEFAULT_THEME_PRESET;
    const initialColor = appearance.project_color;
    const initialColorDark = appearance.project_color_dark;
    const initialAppearance = appearance.default_appearance;
    const initialFiles = useMemo(
        () => ({
            project_logo: appearance.project_logo,
            project_logo_dark: appearance.project_logo_dark,
            public_favicon: appearance.public_favicon,
        }),
        [appearance],
    );

    const [themePreset, setThemePresetState] =
        useState<ThemePresetSlug>(initialPreset);
    const [projectColor, setProjectColorState] = useState<string | null>(
        initialColor,
    );
    const [projectColorDark, setProjectColorDarkState] = useState<
        string | null
    >(initialColorDark);
    const [defaultAppearance, setDefaultAppearanceState] =
        useState(initialAppearance);
    const [files, setFilesState] =
        useState<Record<FileFieldKey, AppearanceFileMeta | null>>(initialFiles);
    const [pickerField, setPickerField] = useState<FileFieldKey | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    const selectedPreset = themePresetBySlug(themePreset);
    const displayColor = projectColor ?? selectedPreset.swatchLight;
    const displayColorDark =
        projectColorDark ?? projectColor ?? selectedPreset.swatchDark;

    const passesAa = brandPassesAa(projectColor, projectColorDark);

    const setThemePreset = (value: ThemePresetSlug): void => {
        setIsDirty(true);
        setThemePresetState(value);
        // Selecting a preset clears custom hex so the palette applies fully.
        setProjectColorState(null);
        setProjectColorDarkState(null);
    };
    const setProjectColor = (value: string | null): void => {
        setIsDirty(true);
        setProjectColorState(value);
    };
    const setProjectColorDark = (value: string | null): void => {
        setIsDirty(true);
        setProjectColorDarkState(value);
    };
    const setDefaultAppearance = (
        value: AppearanceSettings['default_appearance'],
    ): void => {
        setIsDirty(true);
        setDefaultAppearanceState(value);
    };
    const setFiles = (
        action: SetStateAction<Record<FileFieldKey, AppearanceFileMeta | null>>,
    ): void => {
        setIsDirty(true);
        setFilesState(action);
    };

    useRegisterUnsavedChanges({
        scope: 'page',
        isDirty,
        onDiscard: () => {
            setThemePresetState(initialPreset);
            setProjectColorState(initialColor);
            setProjectColorDarkState(initialColorDark);
            setDefaultAppearanceState(initialAppearance);
            setFilesState(initialFiles);
            setIsDirty(false);
        },
    });

    useEffect(() => {
        applyThemeCss(
            buildPreviewThemeCss(themePreset, projectColor, projectColorDark),
        );
    }, [themePreset, projectColor, projectColorDark]);

    useEffect(() => {
        return () => {
            restoreThemeFromAppearance(projectAppearance);
        };
    }, [projectAppearance]);

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('settings.appearance.breadcrumb'),
            href: editAppearance(),
        },
    ];

    const fileFields: {
        key: FileFieldKey;
        inputName: string;
        label: string;
        imagesOnly?: boolean;
    }[] = [
        {
            key: 'project_logo',
            inputName: 'project_logo_id',
            label: t('settings.appearance.projectLogo'),
            imagesOnly: true,
        },
        {
            key: 'project_logo_dark',
            inputName: 'project_logo_dark_id',
            label: t('settings.appearance.projectLogoDark'),
            imagesOnly: true,
        },
        {
            key: 'public_favicon',
            inputName: 'public_favicon_id',
            label: t('settings.appearance.publicFavicon'),
        },
    ];

    const selectFile = (file: AdminFileRow): void => {
        if (!pickerField) {
            return;
        }

        setFiles((current) => ({
            ...current,
            [pickerField]: {
                id: file.id,
                name: file.name,
                url: file.url ?? null,
            },
        }));
        setPickerField(null);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('settings.appearance.head')} />

            <h1 className="sr-only">{t('settings.appearance.head')}</h1>

            <SettingsLayout>
                <Form
                    {...AppearanceSettingsController.update.form()}
                    options={{ preserveScroll: true }}
                    className="space-y-10"
                    onSuccess={() => setIsDirty(false)}
                    noValidate
                >
                    {({ processing, recentlySuccessful, errors }) => (
                        <>
                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t(
                                        'settings.appearance.themePresetTitle',
                                    )}
                                    description={t(
                                        'settings.appearance.themePresetDescription',
                                    )}
                                />

                                <input
                                    type="hidden"
                                    name="theme_preset"
                                    value={themePreset}
                                />

                                <RadioGroup
                                    value={themePreset}
                                    onValueChange={(value) => {
                                        if (
                                            value === 'teal' ||
                                            value === 'indigo' ||
                                            value === 'violet' ||
                                            value === 'rose' ||
                                            value === 'slate'
                                        ) {
                                            setThemePreset(value);
                                        }
                                    }}
                                    className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                                    aria-label={t(
                                        'settings.appearance.themePresetTitle',
                                    )}
                                >
                                    {catalog.map((preset) => {
                                        const selected =
                                            themePreset === preset.slug;

                                        return (
                                            <label
                                                key={preset.slug}
                                                htmlFor={`theme-preset-${preset.slug}`}
                                                className={`flex cursor-pointer flex-col gap-3 rounded-lg border p-3 transition-colors ${
                                                    selected
                                                        ? 'border-ring ring-2 ring-ring/40'
                                                        : 'border-border hover:border-ring/50'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <RadioGroupItem
                                                        id={`theme-preset-${preset.slug}`}
                                                        value={preset.slug}
                                                    />
                                                    <span className="text-sm font-medium">
                                                        {t(
                                                            PRESET_NAME_KEYS[
                                                                preset.slug
                                                            ],
                                                        )}
                                                    </span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <span
                                                        className="flex h-8 flex-1 items-center justify-center rounded-md text-[10px] font-medium text-white"
                                                        style={{
                                                            backgroundColor:
                                                                preset.swatchLight,
                                                        }}
                                                    >
                                                        {t(
                                                            'settings.appearance.presetPreviewLight',
                                                        )}
                                                    </span>
                                                    <span
                                                        className="flex h-8 flex-1 items-center justify-center rounded-md text-[10px] font-medium"
                                                        style={{
                                                            backgroundColor:
                                                                preset.swatchDark,
                                                            color: '#0E171E',
                                                        }}
                                                    >
                                                        {t(
                                                            'settings.appearance.presetPreviewDark',
                                                        )}
                                                    </span>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </RadioGroup>
                                <FieldError id="theme-preset-error">
                                    {errors.theme_preset}
                                </FieldError>
                            </div>

                            <Separator />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t(
                                        'settings.appearance.brandingTitle',
                                    )}
                                    description={t(
                                        'settings.appearance.brandingDescription',
                                    )}
                                />

                                <FieldGroup className="gap-6">
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium">
                                            {t(
                                                'settings.appearance.customColorTitle',
                                            )}
                                        </p>
                                        <FieldDescription>
                                            {t(
                                                'settings.appearance.customColorDescription',
                                            )}
                                        </FieldDescription>
                                    </div>

                                    <Field
                                        data-invalid={
                                            errors.project_color
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="project_color">
                                            {t(
                                                'settings.appearance.projectColor',
                                            )}
                                        </FieldLabel>
                                        <div className="flex h-9 max-w-[220px] items-center gap-2 rounded-md border border-input bg-transparent px-3 shadow-xs has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-inset dark:border-white/25">
                                            <Input
                                                id="project_color"
                                                type="color"
                                                className="h-7 w-7 shrink-0 cursor-pointer border-0 p-0 shadow-none focus-visible:ring-0 [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                                                value={displayColor}
                                                onChange={(event) =>
                                                    setProjectColor(
                                                        event.target.value,
                                                    )
                                                }
                                            />
                                            <Input
                                                name="project_color"
                                                value={projectColor ?? ''}
                                                onChange={(event) =>
                                                    setProjectColor(
                                                        event.target.value ||
                                                            null,
                                                    )
                                                }
                                                className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 font-mono shadow-none focus-visible:ring-0"
                                                placeholder={
                                                    selectedPreset.swatchLight
                                                }
                                                aria-invalid={
                                                    errors.project_color
                                                        ? true
                                                        : undefined
                                                }
                                                aria-describedby={
                                                    errors.project_color
                                                        ? 'project-color-error'
                                                        : !passesAa &&
                                                            projectColor
                                                          ? 'brand-contrast-warning'
                                                          : undefined
                                                }
                                            />
                                        </div>
                                        <FieldError id="project-color-error">
                                            {errors.project_color}
                                        </FieldError>
                                    </Field>

                                    <Field
                                        data-invalid={
                                            errors.project_color_dark
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="project_color_dark">
                                            {t(
                                                'settings.appearance.projectColorDark',
                                            )}
                                        </FieldLabel>
                                        <div className="flex h-9 max-w-[220px] items-center gap-2 rounded-md border border-input bg-transparent px-3 shadow-xs has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-inset dark:border-white/25">
                                            <Input
                                                id="project_color_dark"
                                                type="color"
                                                className="h-7 w-7 shrink-0 cursor-pointer border-0 p-0 shadow-none focus-visible:ring-0 [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                                                value={displayColorDark}
                                                onChange={(event) =>
                                                    setProjectColorDark(
                                                        event.target.value,
                                                    )
                                                }
                                            />
                                            <Input
                                                name="project_color_dark"
                                                value={projectColorDark ?? ''}
                                                onChange={(event) =>
                                                    setProjectColorDark(
                                                        event.target.value ||
                                                            null,
                                                    )
                                                }
                                                aria-label={t(
                                                    'settings.appearance.projectColorDark',
                                                )}
                                                className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 font-mono shadow-none focus-visible:ring-0"
                                                placeholder={
                                                    selectedPreset.swatchDark
                                                }
                                                aria-invalid={
                                                    errors.project_color_dark
                                                        ? true
                                                        : undefined
                                                }
                                                aria-describedby={
                                                    errors.project_color_dark
                                                        ? 'project-color-dark-error'
                                                        : undefined
                                                }
                                            />
                                        </div>
                                        <FieldError id="project-color-dark-error">
                                            {errors.project_color_dark}
                                        </FieldError>
                                    </Field>

                                    {(projectColor || projectColorDark) && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="w-fit"
                                            onClick={() => {
                                                setProjectColor(null);
                                                setProjectColorDark(null);
                                            }}
                                        >
                                            {t(
                                                'settings.appearance.clearCustomColor',
                                            )}
                                        </Button>
                                    )}

                                    {!passesAa &&
                                        (projectColor || projectColorDark) && (
                                            <p
                                                id="brand-contrast-warning"
                                                role="status"
                                                className="text-sm text-warning"
                                            >
                                                {t(
                                                    'settings.appearance.brandContrastWarning',
                                                )}
                                            </p>
                                        )}

                                    {fileFields.map((field) => {
                                        const selected = files[field.key];
                                        const errorId = `${field.inputName.replaceAll('_', '-')}-error`;

                                        return (
                                            <Field
                                                key={field.key}
                                                data-invalid={
                                                    errors[field.inputName]
                                                        ? true
                                                        : undefined
                                                }
                                            >
                                                <FieldLabel>
                                                    {field.label}
                                                </FieldLabel>
                                                <input
                                                    type="hidden"
                                                    name={field.inputName}
                                                    value={selected?.id ?? ''}
                                                />
                                                {selected ? (
                                                    <div className="flex items-center gap-3 rounded-md border p-3">
                                                        {selected.url ? (
                                                            <img
                                                                src={
                                                                    selected.url
                                                                }
                                                                alt={
                                                                    selected.name
                                                                }
                                                                className="size-12 rounded object-cover"
                                                            />
                                                        ) : null}
                                                        <span className="text-sm font-medium">
                                                            {selected.name}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-muted-foreground">
                                                        {t(
                                                            'settings.appearance.noFile',
                                                        )}
                                                    </p>
                                                )}
                                                <div className="flex gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() =>
                                                            setPickerField(
                                                                field.key,
                                                            )
                                                        }
                                                        aria-invalid={
                                                            errors[
                                                                field.inputName
                                                            ]
                                                                ? true
                                                                : undefined
                                                        }
                                                        aria-describedby={
                                                            errors[
                                                                field.inputName
                                                            ]
                                                                ? errorId
                                                                : undefined
                                                        }
                                                    >
                                                        {selected
                                                            ? t(
                                                                  'settings.appearance.changeFile',
                                                              )
                                                            : t(
                                                                  'settings.appearance.chooseFile',
                                                              )}
                                                    </Button>
                                                    {selected ? (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() =>
                                                                setFiles(
                                                                    (
                                                                        current,
                                                                    ) => ({
                                                                        ...current,
                                                                        [field.key]:
                                                                            null,
                                                                    }),
                                                                )
                                                            }
                                                        >
                                                            {t(
                                                                'settings.appearance.clearFile',
                                                            )}
                                                        </Button>
                                                    ) : null}
                                                </div>
                                                <FieldError id={errorId}>
                                                    {errors[field.inputName]}
                                                </FieldError>
                                            </Field>
                                        );
                                    })}
                                </FieldGroup>
                            </div>

                            <Separator />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t(
                                        'settings.appearance.defaultThemeTitle',
                                    )}
                                    description={t(
                                        'settings.appearance.defaultThemeDescription',
                                    )}
                                />

                                <FieldGroup>
                                    <Field
                                        data-invalid={
                                            errors.default_appearance
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="default_appearance">
                                            {t(
                                                'settings.appearance.defaultAppearance',
                                            )}
                                        </FieldLabel>
                                        <input
                                            type="hidden"
                                            name="default_appearance"
                                            value={defaultAppearance}
                                        />
                                        <Select
                                            value={defaultAppearance}
                                            onValueChange={(value) => {
                                                if (
                                                    value === 'system' ||
                                                    value === 'light' ||
                                                    value === 'dark'
                                                ) {
                                                    setDefaultAppearance(value);
                                                }
                                            }}
                                        >
                                            <SelectTrigger
                                                id="default_appearance"
                                                className="w-full"
                                                aria-invalid={
                                                    errors.default_appearance
                                                        ? true
                                                        : undefined
                                                }
                                                aria-describedby={
                                                    errors.default_appearance
                                                        ? 'default-appearance-error'
                                                        : undefined
                                                }
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="system">
                                                    {t(
                                                        'settings.appearance.system',
                                                    )}
                                                </SelectItem>
                                                <SelectItem value="light">
                                                    {t(
                                                        'settings.appearance.light',
                                                    )}
                                                </SelectItem>
                                                <SelectItem value="dark">
                                                    {t(
                                                        'settings.appearance.dark',
                                                    )}
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FieldError id="default-appearance-error">
                                            {errors.default_appearance}
                                        </FieldError>
                                    </Field>
                                </FieldGroup>
                            </div>

                            <SettingsFormActions
                                processing={processing}
                                recentlySuccessful={recentlySuccessful}
                                isDirty={isDirty}
                                data-test="appearance-save"
                            />
                        </>
                    )}
                </Form>

                <FilePickerDrawer
                    open={pickerField !== null}
                    onOpenChange={(open) => {
                        if (!open) {
                            setPickerField(null);
                        }
                    }}
                    acceptImagesOnly={
                        pickerField === 'project_logo' ||
                        pickerField === 'project_logo_dark'
                    }
                    title={t('settings.appearance.chooseFile')}
                    onSelect={(picked) => {
                        const first = picked[0];

                        if (first) {
                            selectFile(first);
                        }
                    }}
                />
            </SettingsLayout>
        </AppLayout>
    );
}

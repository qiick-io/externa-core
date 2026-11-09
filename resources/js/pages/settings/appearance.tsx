import { Form, Head, usePage } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';
import type { SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import AppearanceSettingsController from '@/actions/App/Http/Controllers/Settings/AppearanceSettingsController';
import { FilePickerDrawer } from '@/components/admin/file-picker-drawer';
import Heading from '@/components/heading';
import { ThemePresetField } from '@/components/settings/theme-preset-field';
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
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from '@/components/ui/input-group';
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
import { brandPassesAa } from '@/lib/color-contrast';
import { applyThemeCss, buildPreviewThemeCss } from '@/lib/theme-css';
import { edit as editAppearance } from '@/routes/appearance';
import type {
    AppearanceFileMeta,
    AppearanceSettings,
    BreadcrumbItem,
    ProjectAppearance,
    ThemePresetSlug,
} from '@/types';
import type { AdminFileRow } from '@/types/files';

type FileFieldKey = 'project_logo' | 'project_logo_dark' | 'public_favicon';

/**
 * Re-apply the saved theme CSS (shared Inertia props) over the live preview.
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

    const initialThemePreset = appearance.theme_preset;
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
        useState<ThemePresetSlug>(initialThemePreset);
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

    const selectedPreset =
        appearance.theme_presets.find(
            (preset) => preset.slug === themePreset,
        ) ?? appearance.theme_presets[0];
    const displayColor = projectColor ?? selectedPreset.swatchLight;
    const displayColorDark =
        projectColorDark ?? projectColor ?? selectedPreset.swatchDark;
    const hasCustomColor = Boolean(projectColor || projectColorDark);
    const showsContrastWarning =
        hasCustomColor && !brandPassesAa(projectColor, projectColorDark);

    const setThemePreset = (value: ThemePresetSlug): void => {
        setIsDirty(true);
        setThemePresetState(value);
        // Picking a preset clears the custom hex so the whole palette applies.
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
            setThemePresetState(initialThemePreset);
            setProjectColorState(initialColor);
            setProjectColorDarkState(initialColorDark);
            setDefaultAppearanceState(initialAppearance);
            setFilesState(initialFiles);
            setIsDirty(false);
        },
    });

    // Live preview of the draft; the cleanup restores the latest saved theme.
    useEffect(() => {
        applyThemeCss(
            buildPreviewThemeCss(
                selectedPreset,
                appearance.theme_ai_override,
                projectColor,
                projectColorDark,
            ),
        );

        return () => {
            restoreThemeFromAppearance(projectAppearance);
        };
    }, [
        selectedPreset,
        appearance.theme_ai_override,
        projectColor,
        projectColorDark,
        projectAppearance,
    ]);

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
                    className="space-y-12"
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

                                <ThemePresetField
                                    catalog={appearance.theme_presets}
                                    value={themePreset}
                                    onChange={setThemePreset}
                                    error={errors.theme_preset}
                                />
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
                                        <InputGroup className="max-w-[220px] bg-transparent has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/30 dark:border-input dark:bg-transparent">
                                            <InputGroupAddon
                                                align="inline-start"
                                                className="pl-2"
                                            >
                                                <Input
                                                    id="project_color"
                                                    type="color"
                                                    className="h-7 w-7 shrink-0 cursor-pointer border-0 p-0 shadow-none focus-visible:ring-0 dark:bg-transparent [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                                                    value={displayColor}
                                                    onChange={(event) =>
                                                        setProjectColor(
                                                            event.target.value,
                                                        )
                                                    }
                                                />
                                            </InputGroupAddon>
                                            <InputGroupInput
                                                name="project_color"
                                                value={projectColor ?? ''}
                                                onChange={(event) =>
                                                    setProjectColor(
                                                        event.target.value ||
                                                            null,
                                                    )
                                                }
                                                className="font-mono"
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
                                                        : showsContrastWarning
                                                          ? 'brand-contrast-warning'
                                                          : undefined
                                                }
                                            />
                                        </InputGroup>
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
                                        <InputGroup className="max-w-[220px] bg-transparent has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/30 dark:border-input dark:bg-transparent">
                                            <InputGroupAddon
                                                align="inline-start"
                                                className="pl-2"
                                            >
                                                <Input
                                                    id="project_color_dark"
                                                    type="color"
                                                    className="h-7 w-7 shrink-0 cursor-pointer border-0 p-0 shadow-none focus-visible:ring-0 dark:bg-transparent [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                                                    value={displayColorDark}
                                                    onChange={(event) =>
                                                        setProjectColorDark(
                                                            event.target.value,
                                                        )
                                                    }
                                                />
                                            </InputGroupAddon>
                                            <InputGroupInput
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
                                                className="font-mono"
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
                                        </InputGroup>
                                        <FieldError id="project-color-dark-error">
                                            {errors.project_color_dark}
                                        </FieldError>
                                    </Field>

                                    {hasCustomColor ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
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
                                    ) : null}

                                    {showsContrastWarning ? (
                                        <p
                                            id="brand-contrast-warning"
                                            role="status"
                                            className="text-sm text-warning"
                                        >
                                            {t(
                                                'settings.appearance.brandContrastWarning',
                                            )}
                                        </p>
                                    ) : null}

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
                    onSelect={(files) => {
                        const first = files[0];

                        if (first) {
                            selectFile(first);
                        }
                    }}
                />
            </SettingsLayout>
        </AppLayout>
    );
}

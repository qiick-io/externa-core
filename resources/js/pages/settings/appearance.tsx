import { Form, Head, usePage } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';
import type { SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import AppearanceSettingsController from '@/actions/App/Http/Controllers/Settings/AppearanceSettingsController';
import { FilePickerDrawer } from '@/components/admin/file-picker-drawer';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { SettingsFormActions } from '@/components/settings-form-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { contrastingForeground } from '@/lib/contrasting-foreground';
import { edit as editAppearance } from '@/routes/appearance';
import type {
    AppearanceFileMeta,
    AppearanceSettings,
    BreadcrumbItem,
} from '@/types';
import type { AdminFileRow } from '@/types/files';

type FileFieldKey = 'project_logo' | 'project_logo_dark' | 'public_favicon';

const DEFAULT_PROJECT_COLOR = '#0f172a';

/**
 * Apply draft brand colors to CSS vars for live preview.
 */
function applyBrandPreview(light: string, dark: string): void {
    document.documentElement.style.setProperty('--brand-primary', light);
    document.documentElement.style.setProperty('--brand-primary-dark', dark);
    document.documentElement.style.removeProperty('--primary');
    document.documentElement.style.removeProperty('--primary-foreground');

    const lightFg = contrastingForeground(light);

    if (lightFg) {
        document.documentElement.style.setProperty(
            '--brand-primary-foreground',
            lightFg,
        );
    }

    const darkFg = contrastingForeground(dark);

    if (darkFg) {
        document.documentElement.style.setProperty(
            '--brand-primary-dark-foreground',
            darkFg,
        );
    }
}

/**
 * Restore saved branding CSS vars (or clear if unset).
 */
function restoreBrandFromAppearance(
    appearance:
        | {
              projectColor: string | null;
              projectColorDark: string | null;
              primaryForeground: string | null;
              primaryForegroundDark: string | null;
          }
        | undefined,
): void {
    if (appearance?.projectColor) {
        document.documentElement.style.setProperty(
            '--brand-primary',
            appearance.projectColor,
        );
    } else {
        document.documentElement.style.removeProperty('--brand-primary');
    }

    if (appearance?.primaryForeground) {
        document.documentElement.style.setProperty(
            '--brand-primary-foreground',
            appearance.primaryForeground,
        );
    } else {
        document.documentElement.style.removeProperty(
            '--brand-primary-foreground',
        );
    }

    const darkColor = appearance?.projectColorDark ?? appearance?.projectColor;

    if (darkColor) {
        document.documentElement.style.setProperty(
            '--brand-primary-dark',
            darkColor,
        );
    } else {
        document.documentElement.style.removeProperty('--brand-primary-dark');
    }

    const darkFg =
        appearance?.primaryForegroundDark ?? appearance?.primaryForeground;

    if (darkFg) {
        document.documentElement.style.setProperty(
            '--brand-primary-dark-foreground',
            darkFg,
        );
    } else {
        document.documentElement.style.removeProperty(
            '--brand-primary-dark-foreground',
        );
    }

    document.documentElement.style.removeProperty('--primary');
    document.documentElement.style.removeProperty('--primary-foreground');
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

    const initialColor = appearance.project_color ?? DEFAULT_PROJECT_COLOR;
    const initialColorDark =
        appearance.project_color_dark ??
        appearance.project_color ??
        DEFAULT_PROJECT_COLOR;
    const initialAppearance = appearance.default_appearance;
    const initialFiles = useMemo(
        () => ({
            project_logo: appearance.project_logo,
            project_logo_dark: appearance.project_logo_dark,
            public_favicon: appearance.public_favicon,
        }),
        [appearance],
    );

    const [projectColor, setProjectColorState] = useState(initialColor);
    const [projectColorDark, setProjectColorDarkState] =
        useState(initialColorDark);
    const [defaultAppearance, setDefaultAppearanceState] =
        useState(initialAppearance);
    const [files, setFilesState] =
        useState<Record<FileFieldKey, AppearanceFileMeta | null>>(initialFiles);
    const [pickerField, setPickerField] = useState<FileFieldKey | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    const setProjectColor = (value: string): void => {
        setIsDirty(true);
        setProjectColorState(value);
    };
    const setProjectColorDark = (value: string): void => {
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
        action: SetStateAction<
            Record<FileFieldKey, AppearanceFileMeta | null>
        >,
    ): void => {
        setIsDirty(true);
        setFilesState(action);
    };

    useRegisterUnsavedChanges({
        scope: 'page',
        isDirty,
        onDiscard: () => {
            setProjectColorState(initialColor);
            setProjectColorDarkState(initialColorDark);
            setDefaultAppearanceState(initialAppearance);
            setFilesState(initialFiles);
            setIsDirty(false);
        },
    });

    // Live preview: CSS picks light vs dark brand from .dark class.
    useEffect(() => {
        applyBrandPreview(projectColor, projectColorDark);
    }, [projectColor, projectColorDark]);

    useEffect(() => {
        return () => {
            restoreBrandFromAppearance(projectAppearance);
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
                >
                    {({ processing, recentlySuccessful, errors }) => (
                        <>
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

                                <div className="grid gap-2">
                                    <Label htmlFor="project_color">
                                        {t('settings.appearance.projectColor')}
                                    </Label>
                                    <div className="flex h-9 max-w-[220px] items-center gap-2 rounded-md border border-input bg-transparent px-3 shadow-xs dark:border-white/25 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-inset">
                                        <Input
                                            id="project_color"
                                            type="color"
                                            className="h-7 w-7 shrink-0 cursor-pointer border-0 p-0 shadow-none focus-visible:ring-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0"
                                            value={projectColor}
                                            onChange={(event) =>
                                                setProjectColor(
                                                    event.target.value,
                                                )
                                            }
                                        />
                                        <Input
                                            name="project_color"
                                            value={projectColor}
                                            onChange={(event) =>
                                                setProjectColor(
                                                    event.target.value,
                                                )
                                            }
                                            className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 font-mono shadow-none focus-visible:ring-0"
                                            placeholder="#0f172a"
                                        />
                                    </div>
                                    <InputError
                                        message={errors.project_color}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="project_color_dark">
                                        {t(
                                            'settings.appearance.projectColorDark',
                                        )}
                                    </Label>
                                    <div className="flex h-9 max-w-[220px] items-center gap-2 rounded-md border border-input bg-transparent px-3 shadow-xs dark:border-white/25 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-inset">
                                        <Input
                                            id="project_color_dark"
                                            type="color"
                                            className="h-7 w-7 shrink-0 cursor-pointer border-0 p-0 shadow-none focus-visible:ring-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0"
                                            value={projectColorDark}
                                            onChange={(event) =>
                                                setProjectColorDark(
                                                    event.target.value,
                                                )
                                            }
                                        />
                                        <Input
                                            name="project_color_dark"
                                            value={projectColorDark}
                                            onChange={(event) =>
                                                setProjectColorDark(
                                                    event.target.value,
                                                )
                                            }
                                            className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 font-mono shadow-none focus-visible:ring-0"
                                            placeholder="#0f172a"
                                        />
                                    </div>
                                    <InputError
                                        message={errors.project_color_dark}
                                    />
                                </div>

                                {fileFields.map((field) => {
                                    const selected = files[field.key];

                                    return (
                                        <div
                                            key={field.key}
                                            className="grid gap-2"
                                        >
                                            <Label>{field.label}</Label>
                                            <input
                                                type="hidden"
                                                name={field.inputName}
                                                value={selected?.id ?? ''}
                                            />
                                            {selected ? (
                                                <div className="flex items-center gap-3 rounded-md border p-3">
                                                    {selected.url ? (
                                                        <img
                                                            src={selected.url}
                                                            alt={selected.name}
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
                                                                (current) => ({
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
                                            <InputError
                                                message={
                                                    errors[field.inputName]
                                                }
                                            />
                                        </div>
                                    );
                                })}
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

                                <div className="grid gap-2">
                                    <Label htmlFor="default_appearance">
                                        {t(
                                            'settings.appearance.defaultAppearance',
                                        )}
                                    </Label>
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
                                                {t('settings.appearance.light')}
                                            </SelectItem>
                                            <SelectItem value="dark">
                                                {t('settings.appearance.dark')}
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <InputError
                                        message={errors.default_appearance}
                                    />
                                </div>
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
                    onSelect={selectFile}
                />
            </SettingsLayout>
        </AppLayout>
    );
}

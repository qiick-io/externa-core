export type ThemePresetSlug =
    | 'teal'
    | 'blue'
    | 'indigo'
    | 'violet'
    | 'rose'
    | 'slate';

export type ThemePresetCatalogItem = {
    slug: ThemePresetSlug;
    name: string;
    aiOverride: boolean;
    swatchLight: string;
    swatchDark: string;
    /** Base surfaces merged with the preset's brand colours (server-resolved). */
    light: Record<string, string>;
    dark: Record<string, string>;
};

/** AI accent swap applied when a preset or custom colour sits near the AI hue. */
export type ThemeAiOverride = {
    light: Record<string, string>;
    dark: Record<string, string>;
    hue: number;
    tolerance: number;
};

export type ThemeCssPayload = {
    light: Record<string, string>;
    dark: Record<string, string>;
    brandPrimary: string | null;
    brandPrimaryDark: string | null;
    brandPrimaryForeground: string | null;
    brandPrimaryDarkForeground: string | null;
};

export type ProjectAppearance = {
    projectColor: string | null;
    projectColorDark: string | null;
    primaryForeground: string | null;
    primaryForegroundDark: string | null;
    logoUrl: string | null;
    logoDarkUrl: string | null;
    faviconUrl: string | null;
    defaultAppearance: 'system' | 'light' | 'dark';
    themePreset: ThemePresetSlug;
    brandPassesAa: boolean;
    aiOverrideApplied: boolean;
    themeCss: ThemeCssPayload;
};

export type AppearanceFileMeta = {
    id: number;
    name: string;
    url: string | null;
};

export type AppearanceSettings = {
    theme_preset: ThemePresetSlug;
    project_color: string | null;
    project_color_dark: string | null;
    default_appearance: 'system' | 'light' | 'dark';
    project_logo: AppearanceFileMeta | null;
    project_logo_dark: AppearanceFileMeta | null;
    public_favicon: AppearanceFileMeta | null;
    theme_presets: ThemePresetCatalogItem[];
    theme_ai_override: ThemeAiOverride;
    brand_passes_aa: boolean;
};

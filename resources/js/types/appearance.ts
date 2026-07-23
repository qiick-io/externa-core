export type ProjectAppearance = {
    projectColor: string | null;
    projectColorDark: string | null;
    primaryForeground: string | null;
    primaryForegroundDark: string | null;
    logoUrl: string | null;
    logoDarkUrl: string | null;
    faviconUrl: string | null;
    defaultAppearance: 'system' | 'light' | 'dark';
};

export type AppearanceFileMeta = {
    id: number;
    name: string;
    url: string | null;
};

export type AppearanceSettings = {
    project_color: string | null;
    project_color_dark: string | null;
    default_appearance: 'system' | 'light' | 'dark';
    project_logo: AppearanceFileMeta | null;
    project_logo_dark: AppearanceFileMeta | null;
    public_favicon: AppearanceFileMeta | null;
};
